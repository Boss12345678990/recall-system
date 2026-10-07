import { isValidDateString } from '../lib/dates.js'
import { PHONE_PATTERN, NAME_MAX_LENGTH, COMMENT_MAX_LENGTH, normalizePhoneText } from './patientRules.js'

export const IMPORT_COLUMNS = [
  { key: 'name', header: '姓名', required: true },
  { key: 'birthDate', header: '生日', required: true },
  { key: 'phoneNumber', header: '電話', required: true },
  { key: 'lastVisitDate', header: '上次看診日', required: true },
  { key: 'hasLine', header: '有加 LINE', required: false },
  { key: 'comment', header: '備註', required: false },
]

export const MAX_IMPORT_ROWS = 5000

const HEADER_OF = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column.key, column.header]))
const DATE_FORMAT_MESSAGE = '日期格式錯誤（例：1990-01-31 或 79/1/31）'
const EXCEL_EPOCH_OFFSET_DAYS = 25569 // days from 1899-12-30 to 1970-01-01
const MS_PER_DAY = 86_400_000
const ROC_YEAR_OFFSET = 1911
const YES = new Set(['是', '有', 'y', 'yes', 'true', '1', 'v'])
const NO = new Set(['否', '無', '沒有', 'n', 'no', 'false', '0'])

export function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function toDateString(year, month, day) {
  const text = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isValidDateString(text) ? text : null
}

export function parseDateValue(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 2958465) return null
    return new Date(Math.round((value - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY)).toISOString().slice(0, 10)
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (match) return toDateString(Number(match[1]), Number(match[2]), Number(match[3]))
  match = text.match(/^(?:民國)?\s*(\d{2,3})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (match) return toDateString(Number(match[1]) + ROC_YEAR_OFFSET, Number(match[2]), Number(match[3]))
  return null
}

// Excel stores 0912345678 typed into a number cell as 912345678.
export function normalizeImportPhone(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? `0${value}` : null
  if (typeof value !== 'string') return null
  return normalizePhoneText(value)
}

export function parseHasLine(value) {
  if (isBlank(value)) return true
  if (typeof value === 'boolean') return value
  const text = String(value).trim().toLowerCase()
  if (YES.has(text)) return true
  if (NO.has(text)) return false
  return null
}

export function validateImportRow(raw, today) {
  const errors = []
  const fail = (key, message) => errors.push({ column: HEADER_OF[key], message })

  const name = isBlank(raw.name) ? '' : String(raw.name).trim()
  if (!name) fail('name', '必填')
  else if (name.length > NAME_MAX_LENGTH) fail('name', `姓名最多 ${NAME_MAX_LENGTH} 字`)

  const birthDate = parseDateValue(raw.birthDate)
  if (isBlank(raw.birthDate)) fail('birthDate', '必填')
  else if (!birthDate) fail('birthDate', DATE_FORMAT_MESSAGE)
  else if (birthDate > today) fail('birthDate', '生日不可晚於今天')

  const phoneNumber = normalizeImportPhone(raw.phoneNumber)
  if (isBlank(raw.phoneNumber)) fail('phoneNumber', '必填')
  else if (!phoneNumber || !PHONE_PATTERN.test(phoneNumber)) fail('phoneNumber', '電話格式錯誤，應為 0 開頭的 9–10 位數字')

  const lastVisitDate = parseDateValue(raw.lastVisitDate)
  if (isBlank(raw.lastVisitDate)) fail('lastVisitDate', '必填')
  else if (!lastVisitDate) fail('lastVisitDate', DATE_FORMAT_MESSAGE)
  else if (lastVisitDate > today) fail('lastVisitDate', '上次看診日不可晚於今天')

  const hasLine = parseHasLine(raw.hasLine)
  if (hasLine === null) fail('hasLine', '請填「是」或「否」')

  const comment = isBlank(raw.comment) ? null : String(raw.comment).trim()
  if (comment && comment.length > COMMENT_MAX_LENGTH) fail('comment', `備註最多 ${COMMENT_MAX_LENGTH} 字`)

  return errors.length ? { errors } : { data: { name, birthDate, phoneNumber, lastVisitDate, hasLine, comment } }
}
