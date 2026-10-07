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
