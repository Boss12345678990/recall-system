import * as healthService from '../services/health.service.js'

export async function getHealth(req, res) {
  await healthService.checkDatabase()
  res.json({ success: true, data: { status: 'ok' } })
}
