import { describe, it, expect } from 'vitest'
import express from 'express'
import pino from 'pino'
import request from 'supertest'
import { createRequestLogger } from '../../src/middleware/requestLogger.middleware.js'

describe('request logger', () => {
  it('logs method, path and status but never cookies or query strings', async () => {
    const lines = []
    const app = express()
    app.use(createRequestLogger(pino({ level: 'info' }, { write: (line) => lines.push(line) })))
    app.get('/api/patients', (req, res) => res.cookie('token', 'secret-jwt').json({ ok: true }))

    await request(app).get('/api/patients?search=王小明').set('Cookie', 'token=secret-jwt').expect(200)
    await new Promise((resolve) => setImmediate(resolve))

    const output = lines.join('')
    expect(output).toContain('"method":"GET"')
    expect(output).toContain('"url":"/api/patients"')
    expect(output).toContain('"statusCode":200')
    expect(output).not.toContain('secret-jwt')
    expect(output).not.toContain('search=')
  })
})
