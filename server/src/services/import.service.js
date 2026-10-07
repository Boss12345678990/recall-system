import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma.js'
import { addMonths, fromDbDate, todayInClinic, toDbDate } from '../lib/dates.js'
import { ConflictError, ValidationError } from '../errors/AppError.js'
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, isBlank, validateImportRow } from '../domain/importRows.js'
import { getSettings } from './setting.service.js'

const NAME_CHUNK = 1000

// MySQL's default collation compares names case-insensitively, so the key does too.
function patientKey({ name, birthDate }) {
  return `${name.toLowerCase()}\u0000${birthDate}`
}

function cellValue(cell) {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (value instanceof Date || typeof value !== 'object') return value
  if ('result' in value) return value.result ?? null
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  if ('text' in value) return value.text
  return null
}

function displayValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return isBlank(value) ? '' : String(value)
}

async function readRows(buffer) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new ValidationError('INVALID_FILE', '無法讀取檔案，請確認是 .xlsx 格式')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new ValidationError('INVALID_FILE', '檔案中沒有工作表')

  const columnIndex = {}
  sheet.getRow(1).eachCell((cell, col) => {
    const header = String(cellValue(cell) ?? '').trim()
    const column = IMPORT_COLUMNS.find((c) => c.header === header)
    if (column) columnIndex[column.key] = col
  })
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !columnIndex[c.key]).map((c) => c.header)
  if (missing.length) throw new ValidationError('MISSING_COLUMNS', `缺少欄位：${missing.join('、')}`)

  const rows = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const raw = Object.fromEntries(IMPORT_COLUMNS.map((c) => [
      c.key, columnIndex[c.key] ? cellValue(row.getCell(columnIndex[c.key])) : null,
    ]))
    if (Object.values(raw).every(isBlank)) continue
    rows.push({ rowNumber, raw })
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ValidationError('TOO_MANY_ROWS', `一次最多匯入 ${MAX_IMPORT_ROWS} 筆`)
    }
  }
  if (rows.length === 0) throw new ValidationError('EMPTY_FILE', '檔案中沒有資料')
  return rows
}

// Map of patientKey → id for existing patients matching any of the given rows.
async function findPatientIds(db, rows) {
  const names = [...new Set(rows.map((r) => r.name))]
  const ids = new Map()
  for (let i = 0; i < names.length; i += NAME_CHUNK) {
    const found = await db.patient.findMany({
      where: { name: { in: names.slice(i, i + NAME_CHUNK) } },
      select: { id: true, name: true, birthDate: true },
    })
    for (const p of found) ids.set(patientKey({ name: p.name, birthDate: fromDbDate(p.birthDate) }), p.id)
  }
  return ids
}

export async function buildTemplate() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('客人資料')
  sheet.columns = IMPORT_COLUMNS.map((c) => ({
    header: c.header, key: c.key, width: c.key === 'comment' ? 30 : 16, style: { numFmt: '@' },
  }))
  sheet.getRow(1).font = { bold: true }

  const help = workbook.addWorksheet('說明')
  ;[
    ['欄位', '說明'],
    ['姓名', '必填'],
    ['生日', '必填，例：1990-01-31、1990/1/31 或民國 79/1/31'],
    ['電話', '必填，0 開頭的 9–10 位數字，可含 - 或空白'],
    ['上次看診日', '必填，格式同生日；系統會自動算出下次回診日'],
    ['有加 LINE', '填「是」或「否」，空白視為「是」'],
    ['備註', '選填'],
  ].forEach((row) => help.addRow(row))
  help.getColumn(2).width = 50

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function previewImport(buffer) {
  if (!buffer) throw new ValidationError('FILE_REQUIRED', '請選擇要匯入的檔案')
  const today = todayInClinic()
  const [rows, settings] = await Promise.all([readRows(buffer), getSettings()])

  const checked = rows.map(({ rowNumber, raw }) => ({
    rowNumber,
    raw: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, displayValue(value)])),
    ...validateImportRow(raw, today),
  }))
  const existing = await findPatientIds(prisma, checked.filter((r) => r.data).map((r) => r.data))

  const seen = new Set()
  const out = checked.map(({ rowNumber, raw, data, errors }) => {
    if (errors) return { rowNumber, status: 'error', raw, errors }
    const key = patientKey(data)
    if (seen.has(key)) return { rowNumber, status: 'duplicate-in-file', raw, data }
    seen.add(key)
    if (existing.has(key)) return { rowNumber, status: 'duplicate-existing', raw, data }
    const dueDate = addMonths(data.lastVisitDate, settings.recallIntervalMonths)
    return { rowNumber, status: 'valid', raw, data, dueDate, onHold: dueDate < today }
  })

  const count = (predicate) => out.filter(predicate).length
  return {
    rows: out,
    summary: {
      total: out.length,
      valid: count((r) => r.status === 'valid'),
      error: count((r) => r.status === 'error'),
      duplicate: count((r) => r.status.startsWith('duplicate')),
      onHold: count((r) => r.status === 'valid' && r.onHold),
    },
  }
}

export async function commitImport(rows) {
  const today = todayInClinic()
  const keys = new Set()
  for (const row of rows) {
    const key = patientKey(row)
    if (keys.has(key)) throw new ValidationError('IMPORT_DUPLICATE_IN_FILE', `匯入資料中有重複的客人：${row.name}`)
    keys.add(key)
  }

  return prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx)
    const existing = await findPatientIds(tx, rows)
    const clash = rows.find((row) => existing.has(patientKey(row)))
    if (clash) throw new ConflictError('IMPORT_DUPLICATE', `「${clash.name}」已經存在，請重新預覽後再匯入`)

    await tx.patient.createMany({
      data: rows.map((r) => ({
        name: r.name, phoneNumber: r.phoneNumber, birthDate: toDbDate(r.birthDate), hasLine: r.hasLine, comment: r.comment,
      })),
    })
    const patientIds = await findPatientIds(tx, rows)

    await tx.visit.createMany({
      data: rows.map((r) => ({ patientId: patientIds.get(patientKey(r)), visitDate: toDbDate(r.lastVisitDate) })),
    })
    const visits = await tx.visit.findMany({
      where: { patientId: { in: [...patientIds.values()] } },
      select: { id: true, patientId: true },
    })
    const visitIdByPatient = new Map(visits.map((v) => [v.patientId, v.id]))

    let onHold = 0
    await tx.recall.createMany({
      data: rows.map((r) => {
        const patientId = patientIds.get(patientKey(r))
        const dueDate = addMonths(r.lastVisitDate, settings.recallIntervalMonths)
        const held = dueDate < today
        if (held) onHold += 1
        return { patientId, visitId: visitIdByPatient.get(patientId), dueDate: toDbDate(dueDate), onHold: held }
      }),
    })
    return { imported: rows.length, onHold }
  }, { timeout: 120_000, maxWait: 10_000 })
}
