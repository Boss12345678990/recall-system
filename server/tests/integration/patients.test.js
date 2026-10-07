import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/lib/prisma.js'
import { addDays, todayInClinic } from '../../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'
import { createPatient, createVisitWithRecall } from './helpers/factories.js'

const NEW_PATIENT = { name: '王小明', phoneNumber: '0912-345-678', birthDate: '1990-01-01', hasLine: true, comment: '怕痛' }

let agent
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
})

describe('POST /api/patients', () => {
  it('creates a patient, normalising phone and keeping the birth date exact', async () => {
    const res = await agent.post('/api/patients').send(NEW_PATIENT).expect(201)
    expect(res.body.data).toMatchObject({
      name: '王小明', phoneNumber: '0912345678', birthDate: '1990-01-01', hasLine: true, comment: '怕痛',
      currentRecall: null, visits: [], events: [],
    })
  })

  it('trims half- and full-width spaces from the name', async () => {
    const res = await agent.post('/api/patients').send({ ...NEW_PATIENT, name: ' 王小明　' }).expect(201)
    expect(res.body.data.name).toBe('王小明')
  })

  it('rejects a duplicate name + birth date, even with stray spaces', async () => {
    const first = await agent.post('/api/patients').send(NEW_PATIENT).expect(201)
    const res = await agent.post('/api/patients').send({ ...NEW_PATIENT, name: '王小明　' }).expect(409)
    expect(res.body.error).toEqual({
      code: 'PATIENT_DUPLICATE', message: '已有相同姓名與生日的客人', details: { existingPatientId: first.body.data.id },
    })
  })

  it('validates fields with zh-TW messages', async () => {
    const tomorrow = addDays(todayInClinic(), 1)
    const res = await agent.post('/api/patients')
      .send({ ...NEW_PATIENT, phoneNumber: '12345', birthDate: tomorrow }).expect(400)
    expect(res.body.error.details).toEqual(expect.arrayContaining([
      { field: 'phoneNumber', message: '電話格式錯誤，應為 0 開頭的 9–10 位數字' },
      { field: 'birthDate', message: '日期不可晚於今天' },
    ]))
  })

  it('requires login', async () => {
    await request(createApp()).post('/api/patients').send(NEW_PATIENT).expect(401)
  })
})

describe('GET /api/patients', () => {
  beforeEach(async () => {
    const a = await createPatient({ name: '王小明', phoneNumber: '0912345678', birthDate: '1990-01-01' })
    await createPatient({ name: '陳美玲', phoneNumber: '0933111222', birthDate: '1985-05-05' })
    await createPatient({ name: '林大華', phoneNumber: '0221234567', birthDate: '1970-12-31' })
    await createVisitWithRecall(a.id, { status: 'CONFIRMED' })
  })

  const names = (res) => res.body.data.items.map((p) => p.name)

  it('lists all patients by name with paging info', async () => {
    const res = await agent.get('/api/patients').expect(200)
    expect(res.body.data).toMatchObject({ page: 1, pageSize: 50, total: 3 })
    expect(names(res)).toHaveLength(3)
  })

  it('searches by part of the name', async () => {
    expect(names(await agent.get('/api/patients?search=美玲'))).toEqual(['陳美玲'])
  })

  it('searches by phone digits even when typed with dashes', async () => {
    expect(names(await agent.get('/api/patients?search=0933-111'))).toEqual(['陳美玲'])
  })

  it('searches by exact birth date in either separator style', async () => {
    expect(names(await agent.get('/api/patients?search=1970/12/31'))).toEqual(['林大華'])
  })

  it('filters by current recall status and includes the recall', async () => {
    const res = await agent.get('/api/patients?status=CONFIRMED').expect(200)
    expect(names(res)).toEqual(['王小明'])
    expect(res.body.data.items[0].currentRecall).toMatchObject({ status: 'CONFIRMED', nextAction: null })
  })
})

describe('GET/PATCH/DELETE /api/patients/:id', () => {
  it('returns 404 for a missing patient', async () => {
    const res = await agent.get('/api/patients/999999').expect(404)
    expect(res.body.error).toEqual({ code: 'PATIENT_NOT_FOUND', message: '找不到這位客人' })
  })

  it('returns detail with current recall, visits and events', async () => {
    const p = await createPatient()
    await createVisitWithRecall(p.id, { dueDate: addDays(todayInClinic(), 7) })
    const res = await agent.get(`/api/patients/${p.id}`).expect(200)
    expect(res.body.data.currentRecall).toMatchObject({ step: 'NOT_CONTACTED', status: 'PENDING', version: 0 })
    expect(res.body.data.currentRecall.nextAction).toEqual({ action: 'SEND_LINE', actionDate: todayInClinic(), overdueDays: 0 })
    expect(res.body.data.visits).toHaveLength(1)
    expect(res.body.data.events).toEqual([])
  })

  it('updates fields', async () => {
    const p = await createPatient()
    const res = await agent.patch(`/api/patients/${p.id}`).send({ phoneNumber: '0987 654 321', hasLine: false }).expect(200)
    expect(res.body.data).toMatchObject({ phoneNumber: '0987654321', hasLine: false })
  })

  it('refuses an update that collides with another patient', async () => {
    await createPatient({ name: '甲', birthDate: '1990-01-01' })
    const b = await createPatient({ name: '乙', birthDate: '1990-01-01' })
    const res = await agent.patch(`/api/patients/${b.id}`).send({ name: '甲' }).expect(409)
    expect(res.body.error.code).toBe('PATIENT_DUPLICATE')
  })

  it('rejects an empty update', async () => {
    const p = await createPatient()
    await agent.patch(`/api/patients/${p.id}`).send({}).expect(400)
  })

  it('deletes a patient with their visits and recalls', async () => {
    const p = await createPatient()
    await createVisitWithRecall(p.id)
    await agent.delete(`/api/patients/${p.id}`).expect(200)
    expect(await prisma.visit.count()).toBe(0)
    expect(await prisma.recall.count()).toBe(0)
    await agent.get(`/api/patients/${p.id}`).expect(404)
  })
})
