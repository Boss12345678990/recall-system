import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/lib/prisma.js'
import { ensureUser, resetPassword } from '../../src/services/auth.service.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent, TEST_USER } from './helpers/auth.js'

let app
beforeEach(async () => {
  await resetDb()
  await ensureUser(TEST_USER.username, TEST_USER.password)
  app = createApp()
})

describe('POST /api/auth/login', () => {
  it('sets an httpOnly, SameSite=Strict token cookie', async () => {
    const res = await request(app).post('/api/auth/login').send(TEST_USER).expect(200)
    expect(res.body).toEqual({ success: true, data: { user: { id: expect.any(Number), username: 'clinic' } } })
    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toMatch(/^token=/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Strict/)
  })

  it.each([
    ['wrong password', { username: 'clinic', password: 'nope-nope' }],
    ['unknown user', { username: 'ghost', password: 'password123' }],
  ])('rejects %s with the same zh-TW message', async (label, body) => {
    const res = await request(app).post('/api/auth/login').send(body).expect(401)
    expect(res.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' })
  })

  it('validates required fields', async () => {
    const res = await request(app).post('/api/auth/login').send({}).expect(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.map((d) => d.field)).toEqual(['username', 'password'])
  })

  it('rate-limits after 10 failed attempts', async () => {
    for (let i = 0; i < 10; i += 1) {
      await request(app).post('/api/auth/login').send({ username: 'clinic', password: 'wrong-pass' }).expect(401)
    }
    const res = await request(app).post('/api/auth/login').send(TEST_USER).expect(429)
    expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS')
  })

  it('stores only a bcrypt hash', async () => {
    const user = await prisma.user.findUnique({ where: { username: 'clinic' } })
    expect(user.passwordHash).not.toBe(TEST_USER.password)
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/)
  })
})

describe('session', () => {
  it('GET /me requires the cookie', async () => {
    const res = await request(app).get('/api/auth/me').expect(401)
    expect(res.body.error).toEqual({ code: 'UNAUTHORIZED', message: '請先登入' })
  })

  it('GET /me returns the user when logged in', async () => {
    const agent = await loggedInAgent(app)
    const res = await agent.get('/api/auth/me').expect(200)
    expect(res.body.data).toEqual({ id: expect.any(Number), username: 'clinic' })
  })

  it('rejects a tampered token', async () => {
    await request(app).get('/api/auth/me').set('Cookie', 'token=not-a-jwt').expect(401)
  })

  it('logout clears the cookie', async () => {
    const agent = await loggedInAgent(app)
    await agent.post('/api/auth/logout').expect(200)
    await agent.get('/api/auth/me').expect(401)
  })
})

describe('PATCH /api/auth/password', () => {
  it('rejects a wrong current password', async () => {
    const agent = await loggedInAgent(app)
    const res = await agent.patch('/api/auth/password')
      .send({ currentPassword: 'wrong-one', newPassword: 'new-password-1' }).expect(400)
    expect(res.body.error).toEqual({ code: 'WRONG_PASSWORD', message: '目前密碼不正確' })
  })

  it('rejects a short new password', async () => {
    const agent = await loggedInAgent(app)
    const res = await agent.patch('/api/auth/password')
      .send({ currentPassword: TEST_USER.password, newPassword: 'short' }).expect(400)
    expect(res.body.error.message).toBe('新密碼至少 8 個字元')
  })

  it('changes the password', async () => {
    const agent = await loggedInAgent(app)
    await agent.patch('/api/auth/password')
      .send({ currentPassword: TEST_USER.password, newPassword: 'new-password-1' }).expect(200)
    await request(app).post('/api/auth/login').send(TEST_USER).expect(401)
    await request(app).post('/api/auth/login').send({ username: 'clinic', password: 'new-password-1' }).expect(200)
  })
})

describe('resetPassword (admin script)', () => {
  it('overwrites the only user without knowing the old password', async () => {
    await expect(resetPassword('reset-password-1')).resolves.toBe('clinic')
    await request(app).post('/api/auth/login').send({ username: 'clinic', password: 'reset-password-1' }).expect(200)
  })
})
