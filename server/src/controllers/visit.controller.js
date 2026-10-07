import * as visitService from '../services/visit.service.js'

export async function recordVisit(req, res) {
  const data = await visitService.recordVisit(req.valid.params.id, req.valid.body)
  res.status(201).json({ success: true, data })
}

export async function deleteVisit(req, res) {
  res.json({ success: true, data: await visitService.deleteVisit(req.valid.params.id) })
}
