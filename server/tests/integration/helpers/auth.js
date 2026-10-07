import request from 'supertest'
import { createApp } from '../../../src/app.js'
import { ensureUser } from '../../../src/services/auth.service.js'

export const TEST_USER = { username: 'clinic', password: 'password123' }

export async function loggedInAgent(app = createApp()) {
  await ensureUser(TEST_USER.username, TEST_USER.password)
  const agent = request.agent(app)
  await agent.post('/api/auth/login').send(TEST_USER).expect(200)
  return agent
}
