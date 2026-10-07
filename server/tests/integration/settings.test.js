import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'

let agent
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
})

describe('settings', () => {
  it('returns defaults on first read', async () => {
    const res = await agent.get('/api/settings').expect(200)
    expect(res.body.data).toEqual({ recallIntervalMonths: 6, lineLeadDays: 7, callAfterLineDays: 3, callGapDays: 2 })
  })

  it('updates only the fields sent', async () => {
    const res = await agent.patch('/api/settings').send({ recallIntervalMonths: 3 }).expect(200)
    expect(res.body.data).toEqual({ recallIntervalMonths: 3, lineLeadDays: 7, callAfterLineDays: 3, callGapDays: 2 })
  })

  it('rejects values out of range with a zh-TW field message', async () => {
    const res = await agent.patch('/api/settings').send({ callGapDays: 0 }).expect(400)
    expect(res.body.error.details).toEqual([{ field: 'callGapDays', message: '電話間隔天數需介於 1–14' }])
  })

  it('rejects an empty update and unknown keys', async () => {
    await agent.patch('/api/settings').send({}).expect(400)
    await agent.patch('/api/settings').send({ foo: 1 }).expect(400)
  })

  it('requires login', async () => {
    await request(createApp()).get('/api/settings').expect(401)
  })
})
