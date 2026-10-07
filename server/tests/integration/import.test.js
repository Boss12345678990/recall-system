import { describe, it, expect, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'
import { prisma } from '../../src/lib/prisma.js'
import { addDays, addMonths, todayInClinic } from '../../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'
import { createPatient } from './helpers/factories.js'
import { buildXlsx } from './helpers/xlsx.js'

let agent
let today
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
  today = todayInClinic()
})

const preview = (buffer) => agent.post('/api/imports/preview').attach('file', buffer, 'patients.xlsx')

describe('GET /api/imports/template', () => {
  it('downloads a workbook with the expected headers', async () => {
    const res = await agent.get('/api/imports/template').buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))) })
      .expect(200)
    expect(res.headers['content-type']).toContain('spreadsheetml')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(res.body)
    expect(workbook.worksheets[0].getRow(1).values.slice(1)).toEqual(['姓名', '生日', '電話', '上次看診日', '有加 LINE', '備註'])
  })
})

describe('POST /api/imports/preview', () => {
  it('classifies every row', async () => {
    await createPatient({ name: '已存在', birthDate: '1980-01-01' })
    const recent = addDays(today, -30)
    const old = addDays(today, -400)
    const buffer = await buildXlsx([
      ['王小明', '79/1/31', 912345678, recent, '是', ''],
      ['陳美玲', new Date(Date.UTC(1985, 4, 5)), '0933-111-222', old, '否', '怕痛'],
      ['', '1990-01-01', '0912345678', recent, '', ''],
      ['王小明', '79/1/31', '0912000000', recent, '', ''],
      ['已存在', '1980-01-01', '0912345678', recent, '', ''],
    ])
    const { data } = (await preview(buffer).expect(200)).body
    expect(data.rows.map((r) => [r.rowNumber, r.status])).toEqual([
      [2, 'valid'], [3, 'valid'], [4, 'error'], [5, 'duplicate-in-file'], [6, 'duplicate-existing'],
    ])
    expect(data.rows[0]).toMatchObject({
      data: { name: '王小明', birthDate: '1990-01-31', phoneNumber: '0912345678', hasLine: true },
      dueDate: addMonths(recent, 6), onHold: false,
    })
    expect(data.rows[1]).toMatchObject({ data: { birthDate: '1985-05-05', hasLine: false }, onHold: true })
    expect(data.rows[2].errors).toEqual([{ column: '姓名', message: '必填' }])
    expect(data.summary).toEqual({ total: 5, valid: 2, error: 1, duplicate: 2, onHold: 1 })
  })

  it('reports missing required columns', async () => {
    const res = await preview(await buildXlsx([], ['姓名', '電話'])).expect(400)
    expect(res.body.error).toEqual({ code: 'MISSING_COLUMNS', message: '缺少欄位：生日、上次看診日' })
  })

  it('rejects a file that is not xlsx', async () => {
    const res = await agent.post('/api/imports/preview').attach('file', Buffer.from('hello'), 'notes.xlsx').expect(400)
    expect(res.body.error.code).toBe('INVALID_FILE')
  })

  it('requires a file', async () => {
    const res = await agent.post('/api/imports/preview').expect(400)
    expect(res.body.error.code).toBe('FILE_REQUIRED')
  })
})

describe('POST /api/imports/commit', () => {
  const row = (overrides) => ({
    name: '王小明', birthDate: '1990-01-31', phoneNumber: '0912345678',
    lastVisitDate: addDays(today, -30), hasLine: true, comment: null, ...overrides,
  })

  it('creates patients, visits and recalls; past-due ones go on hold', async () => {
    const res = await agent.post('/api/imports/commit').send({
      rows: [row(), row({ name: '陳美玲', lastVisitDate: addDays(today, -400) })],
    }).expect(201)
    expect(res.body.data).toEqual({ imported: 2, onHold: 1 })
    expect(await prisma.patient.count()).toBe(2)
    expect(await prisma.visit.count()).toBe(2)
    expect(await prisma.recall.count({ where: { onHold: true } })).toBe(1)

    const overdue = (await agent.get('/api/recalls?list=import-overdue')).body.data.items
    expect(overdue.map((i) => i.patient.name)).toEqual(['陳美玲'])
    const todayItems = (await agent.get('/api/recalls/today')).body.data.items
    expect(todayItems).toHaveLength(0)
  })

  it('writes nothing when any row already exists', async () => {
    await createPatient({ name: '已存在', birthDate: '1980-01-01' })
    const res = await agent.post('/api/imports/commit').send({
      rows: [row(), row({ name: '已存在', birthDate: '1980-01-01' })],
    }).expect(409)
    expect(res.body.error.code).toBe('IMPORT_DUPLICATE')
    expect(await prisma.patient.count()).toBe(1)
  })

  it('re-validates rows sent by the client', async () => {
    await agent.post('/api/imports/commit').send({ rows: [row({ phoneNumber: '123' })] }).expect(400)
    await agent.post('/api/imports/commit').send({ rows: [row(), row()] }).expect(400)
  })
})
