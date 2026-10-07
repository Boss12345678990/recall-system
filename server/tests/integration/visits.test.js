import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../src/lib/prisma.js'
import { addDays, addMonths, fromDbDate, todayInClinic } from '../../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'
import { createPatient, createVisitWithRecall } from './helpers/factories.js'

let agent
let today
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
  today = todayInClinic()
})

describe('POST /api/patients/:id/visits', () => {
  it('records today by default and opens a recall due in 6 months', async () => {
    const p = await createPatient()
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({}).expect(201)
    expect(res.body.data.visit).toMatchObject({ patientId: p.id, visitDate: today })
    expect(res.body.data.recall).toMatchObject({ dueDate: addMonths(today, 6), step: 'NOT_CONTACTED', status: 'PENDING' })
  })

  it('uses the configured recall interval', async () => {
    await agent.patch('/api/settings').send({ recallIntervalMonths: 3 }).expect(200)
    const p = await createPatient()
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({}).expect(201)
    expect(res.body.data.recall.dueDate).toBe(addMonths(today, 3))
  })

  it('accepts a back-dated visit', async () => {
    const p = await createPatient()
    const visitDate = addDays(today, -3)
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({ visitDate }).expect(201)
    expect(res.body.data.recall.dueDate).toBe(addMonths(visitDate, 6))
  })

  it('completes the current recall, whatever its status, and logs the change', async () => {
    const p = await createPatient()
    const { recall: old } = await createVisitWithRecall(p.id, {
      visitDate: addDays(today, -200), dueDate: addDays(today, -17), status: 'UNREACHABLE', step: 'CALLED_3',
    })
    await agent.post(`/api/patients/${p.id}/visits`).send({}).expect(201)
    const closed = await prisma.recall.findUnique({ where: { id: old.id } })
    expect(closed.status).toBe('COMPLETED')
    const event = await prisma.recallEvent.findFirst({ where: { recallId: old.id } })
    expect(event).toMatchObject({ type: 'VISIT_RECORDED', before: expect.objectContaining({ status: 'UNREACHABLE' }) })
    expect(await prisma.recall.count({ where: { patientId: p.id, status: { not: 'COMPLETED' } } })).toBe(1)
  })

  it.each([
    ['the same date twice', 0, 409, 'VISIT_DATE_TAKEN'],
    ['a date before the latest visit', -1, 400, 'VISIT_BEFORE_LATEST'],
  ])('rejects %s', async (label, offset, status, code) => {
    const p = await createPatient()
    await createVisitWithRecall(p.id, { visitDate: today })
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({ visitDate: addDays(today, offset) }).expect(status)
    expect(res.body.error.code).toBe(code)
  })

  it('rejects a future visit date', async () => {
    const p = await createPatient()
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({ visitDate: addDays(today, 1) }).expect(400)
    expect(res.body.error).toMatchObject({ code: 'VISIT_DATE_IN_FUTURE', message: '看診日不可晚於今天' })
  })

  it('returns 404 for a missing patient', async () => {
    await agent.post('/api/patients/999999/visits').send({}).expect(404)
  })
})

describe('DELETE /api/visits/:id', () => {
  it('removes the latest visit and restores the previous recall', async () => {
    const p = await createPatient()
    const { recall: old } = await createVisitWithRecall(p.id, {
      visitDate: addDays(today, -190), dueDate: addDays(today, -7), status: 'CONFIRMED', confirmedAt: addDays(today, -10),
    })
    const created = await agent.post(`/api/patients/${p.id}/visits`).send({}).expect(201)

    await agent.delete(`/api/visits/${created.body.data.visit.id}`).expect(200)

    const restored = await prisma.recall.findUnique({ where: { id: old.id } })
    expect(restored.status).toBe('CONFIRMED')
    expect(fromDbDate(restored.confirmedAt)).toBe(addDays(today, -10))
    expect(await prisma.recall.count({ where: { patientId: p.id } })).toBe(1)
    const lastEvent = await prisma.recallEvent.findFirst({ where: { recallId: old.id }, orderBy: { id: 'desc' } })
    expect(lastEvent).toMatchObject({ type: 'UNDO', note: '撤銷看診' })
  })

  it('refuses to delete a visit that is not the latest', async () => {
    const p = await createPatient()
    const { visit: older } = await createVisitWithRecall(p.id, { visitDate: addDays(today, -190), status: 'COMPLETED' })
    await createVisitWithRecall(p.id, { visitDate: today })
    const res = await agent.delete(`/api/visits/${older.id}`).expect(409)
    expect(res.body.error).toEqual({ code: 'VISIT_NOT_LATEST', message: '只能刪除最新一筆看診紀錄' })
  })

  it('leaves no current recall when the only visit is deleted', async () => {
    const p = await createPatient()
    const { visit } = await createVisitWithRecall(p.id)
    await agent.delete(`/api/visits/${visit.id}`).expect(200)
    const detail = await agent.get(`/api/patients/${p.id}`).expect(200)
    expect(detail.body.data).toMatchObject({ currentRecall: null, visits: [] })
  })
})

describe('POST /api/patients with registerVisitToday', () => {
  it('creates the patient and their first recall in one step', async () => {
    const res = await agent.post('/api/patients').send({
      name: '新客人', phoneNumber: '0912000111', birthDate: '2000-02-02', registerVisitToday: true,
    }).expect(201)
    expect(res.body.data.visits).toHaveLength(1)
    expect(res.body.data.currentRecall).toMatchObject({ dueDate: addMonths(today, 6), status: 'PENDING' })
  })
})
