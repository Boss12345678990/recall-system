import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/lib/prisma.js'
import { toDbDate } from '../../src/lib/dates.js'
import { resetDb } from './helpers/db.js'

describe('GET /api/health', () => {
  it('reports ok when the database is reachable', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } })
  })
})

describe('schema', () => {
  beforeEach(resetDb)

  it('enforces one patient per (name, birthDate)', async () => {
    const data = { name: '王小明', phoneNumber: '0912345678', birthDate: toDbDate('1990-01-01') }
    await prisma.patient.create({ data })
    await expect(prisma.patient.create({ data })).rejects.toMatchObject({ code: 'P2002' })
  })
})
