import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../src/lib/prisma.js'
import { seedDemoData, DEMO_TAG } from '../../src/scripts/demoData.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'

let agent
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
})

describe('seedDemoData', () => {
  it('fills today\'s list in urgency order and every secondary list', async () => {
    await seedDemoData()
    const { data } = (await agent.get('/api/recalls/today').expect(200)).body
    expect(data.items.map((i) => [i.patient.name, i.nextAction.action, i.nextAction.overdueDays])).toEqual([
      ['吳雅婷', 'CALL_3', 2],
      ['李美玲', 'CALL_1', 1],
      ['陳淑芬', 'SEND_LINE', 2],
      ['黃建國', 'CALL_2', 0],
      ['張家豪', 'CALL_1', 0],
      ['王秀英', 'CALL_1', 0],
      ['林志明', 'SEND_LINE', 0],
    ])
    expect(data.summary).toEqual({ total: 7, overdue: 3 })
    expect(data.counts).toEqual({ waiting: 2, confirmed: 2, unreachable: 1, 'import-overdue': 2 })
  })

  it('records a history event for every contact so the detail page has something to show', async () => {
    await seedDemoData()
    const patient = await prisma.patient.findFirst({ where: { name: '吳雅婷' } })
    const detail = (await agent.get(`/api/patients/${patient.id}`).expect(200)).body.data
    expect(detail.events.map((e) => e.action)).toEqual(['CALL_NO_ANSWER', 'CALL_NO_ANSWER', 'LINE_SENT'])
  })

  it('can be re-run without duplicating and leaves real patients alone', async () => {
    await prisma.patient.create({ data: { name: '真的病患', phoneNumber: '0912345678', birthDate: new Date('1990-01-01T00:00:00Z') } })
    await seedDemoData()
    const first = await prisma.patient.count()
    await seedDemoData()
    expect(await prisma.patient.count()).toBe(first)
    expect(await prisma.patient.count({ where: { comment: { startsWith: DEMO_TAG } } })).toBe(first - 1)
  })
})
