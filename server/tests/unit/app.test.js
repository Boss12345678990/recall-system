import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

describe('app', () => {
  it('returns a JSON 404 envelope for unknown API routes', async () => {
    const res = await request(createApp()).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ success: false, error: { code: 'ROUTE_NOT_FOUND', message: '找不到此 API' } })
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await request(createApp())
      .post('/api/anything').set('Content-Type', 'application/json').send('{"broken"')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_JSON')
  })
})

describe('serving the client', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-dist-'))
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>回診追蹤系統</title>')

  it('serves index.html for client routes', async () => {
    const res = await request(createApp({ clientDist: dist })).get('/patients/12')
    expect(res.status).toBe(200)
    expect(res.text).toContain('回診追蹤系統')
  })

  it('still answers unknown API routes with JSON', async () => {
    const res = await request(createApp({ clientDist: dist })).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND')
  })
})
