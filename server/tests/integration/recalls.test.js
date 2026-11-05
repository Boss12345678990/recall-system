import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../src/lib/prisma.js'
import { addDays, todayInClinic } from '../../src/lib/dates.js'
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

async function patientWithRecall(recall = {}, patient = {}) {
  const p = await createPatient(patient)
  const { recall: row } = await createVisitWithRecall(p.id, recall)
  return row
}

describe('GET /api/recalls/today', () => {
  it('lists due recalls sorted by urgency with a summary and list counts', async () => {
    await patientWithRecall({ dueDate: addDays(today, 7) }, { name: '甲' })
    await patientWithRecall({
      dueDate: addDays(today, 3), step: 'CALLED_2',
      lineSentAt: addDays(today, -7), call1At: addDays(today, -4), call2At: addDays(today, -2),
    }, { name: '乙' })
    await patientWithRecall({ dueDate: addDays(today, 5), step: 'LINE_SENT', lineSentAt: addDays(today, -5) }, { name: '丙' })
    await patientWithRecall({ dueDate: addDays(today, 8) }, { name: '丁' })
    await patientWithRecall({ dueDate: addDays(today, 7), status: 'CONFIRMED' }, { name: '戊' })
    await patientWithRecall({ dueDate: addDays(today, -30), onHold: true }, { name: '己' })

    const { data } = (await agent.get('/api/recalls/today').expect(200)).body
    expect(data.items.map((i) => i.patient.name)).toEqual(['乙', '丙', '甲'])
    expect(data.summary).toEqual({ total: 3, overdue: 1 })
    expect(data.items[1].nextAction).toEqual({ action: 'CALL_1', actionDate: addDays(today, -2), overdueDays: 2 })
    expect(data.counts).toEqual({ waiting: 0, confirmed: 1, unreachable: 0, 'import-overdue': 1 })
    expect(data.progress).toEqual({ done: 0, total: 3 })
  })

  it('counts recalls handled today in progress after they leave the to-do list', async () => {
    const recall = await patientWithRecall({ dueDate: addDays(today, 7) })
    await patientWithRecall({ dueDate: addDays(today, 7) })
    await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'LINE_SENT', version: 0 }).expect(200)
    const { data } = (await agent.get('/api/recalls/today').expect(200)).body
    expect(data.items).toHaveLength(1)
    expect(data.progress).toEqual({ done: 1, total: 2 })
    expect(data.counts.waiting).toBe(1)
  })

  it('asks for a call instead of LINE for patients without LINE', async () => {
    await patientWithRecall({ dueDate: addDays(today, 7) }, { hasLine: false })
    const { data } = (await agent.get('/api/recalls/today').expect(200)).body
    expect(data.items[0].nextAction.action).toBe('CALL_1')
  })
})

describe('GET /api/recalls?list=', () => {
  it('returns each tab list', async () => {
    await patientWithRecall({ dueDate: addDays(today, 1), status: 'CONFIRMED' }, { name: '確認未過期' })
    await patientWithRecall({ dueDate: addDays(today, -1), status: 'CONFIRMED' }, { name: '確認未到' })
    await patientWithRecall({ dueDate: addDays(today, 6), step: 'LINE_SENT', lineSentAt: addDays(today, -1) }, { name: '等回覆' })
    await patientWithRecall({ dueDate: addDays(today, 30) }, { name: '還沒聯絡' })
    await patientWithRecall({ dueDate: addDays(today, -40), onHold: true }, { name: '過期匯入' })
    await patientWithRecall({ step: 'CALLED_3', status: 'UNREACHABLE' }, { name: '聯絡不上' })

    const names = async (list) =>
      (await agent.get(`/api/recalls?list=${list}`).expect(200)).body.data.items.map((i) => i.patient.name)
    expect(await names('confirmed')).toEqual(['確認未到', '確認未過期'])
    expect(await names('waiting')).toEqual(['等回覆'])
    expect(await names('import-overdue')).toEqual(['過期匯入'])
    expect(await names('unreachable')).toEqual(['聯絡不上'])
  })

  it('rejects an unknown list', async () => {
    await agent.get('/api/recalls?list=everything').expect(400)
  })
})

describe('POST /api/recalls/:id/actions', () => {
  it('records LINE sent, bumps the version and logs an event', async () => {
    const recall = await patientWithRecall({ dueDate: addDays(today, 7) })
    const res = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'LINE_SENT', version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ step: 'LINE_SENT', lineSentAt: today, version: 1 })
    expect(res.body.data.recall.nextAction).toEqual({ action: 'CALL_1', actionDate: addDays(today, 3), overdueDays: 0 })
    const event = await prisma.recallEvent.findUnique({ where: { id: res.body.data.eventId } })
    expect(event).toMatchObject({ type: 'ACTION', action: 'LINE_SENT' })
    const todayList = (await agent.get('/api/recalls/today')).body.data
    expect(todayList.items).toHaveLength(0)
  })

  it('marks UNREACHABLE on the third unanswered call', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_2', call2At: addDays(today, -2) })
    const res = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'CALL_NO_ANSWER', version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ step: 'CALLED_3', call3At: today, status: 'UNREACHABLE', nextAction: null })
  })

  it('confirms', async () => {
    const recall = await patientWithRecall()
    const res = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'CONFIRM', version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ status: 'CONFIRMED', confirmedAt: today })
  })

  it('rejects a second click carrying the same version without recording a second call', async () => {
    const recall = await patientWithRecall({ step: 'LINE_SENT', lineSentAt: addDays(today, -3) })
    const body = { action: 'CALL_NO_ANSWER', version: 0 }
    await agent.post(`/api/recalls/${recall.id}/actions`).send(body).expect(200)
    const second = await agent.post(`/api/recalls/${recall.id}/actions`).send(body).expect(409)
    expect(second.body.error).toEqual({ code: 'RECALL_STALE', message: '這筆資料剛被其他人更新，已重新整理' })
    expect((await prisma.recall.findUnique({ where: { id: recall.id } })).step).toBe('CALLED_1')
    expect(await prisma.recallEvent.count({ where: { recallId: recall.id } })).toBe(1)
  })

  it('rejects an action that does not fit the current step', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_1', call1At: today })
    const res = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'LINE_SENT', version: 0 }).expect(409)
    expect(res.body.error.code).toBe('ACTION_NOT_ALLOWED')
  })

  it('returns 404 for a missing recall', async () => {
    await agent.post('/api/recalls/999999/actions').send({ action: 'CONFIRM', version: 0 }).expect(404)
  })
})

describe('POST /api/recalls/:id/undo', () => {
  it('restores the previous state, once', async () => {
    const recall = await patientWithRecall({ dueDate: addDays(today, 7) })
    const acted = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'LINE_SENT', version: 0 }).expect(200)
    const { eventId } = acted.body.data

    const undone = await agent.post(`/api/recalls/${recall.id}/undo`).send({ eventId, version: 1 }).expect(200)
    expect(undone.body.data.recall).toMatchObject({ step: 'NOT_CONTACTED', lineSentAt: null, version: 2 })

    const again = await agent.post(`/api/recalls/${recall.id}/undo`).send({ eventId, version: 2 }).expect(409)
    expect(again.body.error.code).toBe('UNDO_NOT_ALLOWED')
  })
})

describe('PATCH /api/recalls/:id', () => {
  it('moves the step forward, filling dates, and saves the note on the event', async () => {
    const recall = await patientWithRecall()
    const res = await agent.patch(`/api/recalls/${recall.id}`)
      .send({ step: 'CALLED_1', note: '病患說下週再約', version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ step: 'CALLED_1', lineSentAt: today, call1At: today })
    const event = await prisma.recallEvent.findUnique({ where: { id: res.body.data.eventId } })
    expect(event).toMatchObject({ type: 'MANUAL_EDIT', note: '病患說下週再約' })
  })

  it('marks UNREACHABLE when moved to call 3', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_2' })
    const res = await agent.patch(`/api/recalls/${recall.id}`).send({ step: 'CALLED_3', version: 0 }).expect(200)
    expect(res.body.data.recall.status).toBe('UNREACHABLE')
  })

  it('rejects PENDING at call 3 with a zh-TW explanation', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_3', status: 'UNREACHABLE' })
    const res = await agent.patch(`/api/recalls/${recall.id}`).send({ status: 'PENDING', version: 0 }).expect(400)
    expect(res.body.error).toEqual({
      code: 'PENDING_AT_CALLED_3', message: '已撥打 3 次的追蹤無法設為未確認，請同時將步驟改回較早的階段',
    })
  })

  it('does not allow COMPLETED by hand', async () => {
    const recall = await patientWithRecall()
    await agent.patch(`/api/recalls/${recall.id}`).send({ status: 'COMPLETED', version: 0 }).expect(400)
  })

  it('refuses to edit a completed recall', async () => {
    const recall = await patientWithRecall({ status: 'COMPLETED' })
    const res = await agent.patch(`/api/recalls/${recall.id}`).send({ dueDate: addDays(today, 30), version: 0 }).expect(409)
    expect(res.body.error.code).toBe('RECALL_COMPLETED')
  })

  it('requires at least one change', async () => {
    const recall = await patientWithRecall()
    await agent.patch(`/api/recalls/${recall.id}`).send({ version: 0 }).expect(400)
  })
})

describe('POST /api/recalls/:id/restart', () => {
  it('restarts an unreachable recall with a new due date', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_3', status: 'UNREACHABLE', call3At: addDays(today, -1) })
    const dueDate = addDays(today, 7)
    const res = await agent.post(`/api/recalls/${recall.id}/restart`).send({ dueDate, version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ status: 'PENDING', step: 'NOT_CONTACTED', call3At: null, dueDate, onHold: false })
    const event = await prisma.recallEvent.findUnique({ where: { id: res.body.data.eventId } })
    expect(event.type).toBe('RESTART')
  })

  it('releases an on-hold import into today\'s list', async () => {
    const recall = await patientWithRecall({ dueDate: addDays(today, -40), onHold: true })
    await agent.post(`/api/recalls/${recall.id}/restart`).send({ dueDate: addDays(today, 7), version: 0 }).expect(200)
    const { data } = (await agent.get('/api/recalls/today')).body
    expect(data.items.map((i) => i.id)).toEqual([recall.id])
  })

  it('reschedules (改約) a recall that is still in progress and notes the new date', async () => {
    const recall = await patientWithRecall({ step: 'LINE_SENT', lineSentAt: addDays(today, -1) })
    const dueDate = addDays(today, 14)
    const res = await agent.post(`/api/recalls/${recall.id}/restart`).send({ dueDate, version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ step: 'NOT_CONTACTED', lineSentAt: null, dueDate })
    const event = await prisma.recallEvent.findUnique({ where: { id: res.body.data.eventId } })
    expect(event.note).toBe(`改約至 ${dueDate.replaceAll('-', '/')}`)
  })

  it('refuses a completed recall', async () => {
    const recall = await patientWithRecall({ status: 'COMPLETED' })
    const res = await agent.post(`/api/recalls/${recall.id}/restart`).send({ dueDate: addDays(today, 7), version: 0 }).expect(409)
    expect(res.body.error.code).toBe('RESTART_NOT_ALLOWED')
  })

  it('refuses a due date in the past', async () => {
    const recall = await patientWithRecall({ status: 'UNREACHABLE', step: 'CALLED_3' })
    const res = await agent.post(`/api/recalls/${recall.id}/restart`).send({ dueDate: addDays(today, -1), version: 0 }).expect(400)
    expect(res.body.error.code).toBe('DUE_DATE_IN_PAST')
  })
})
