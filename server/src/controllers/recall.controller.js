import * as recallService from '../services/recall.service.js'

export async function getToday(req, res) {
  res.json({ success: true, data: await recallService.getToday() })
}

export async function getList(req, res) {
  res.json({ success: true, data: await recallService.getList(req.valid.query.list) })
}

export async function recordAction(req, res) {
  res.json({ success: true, data: await recallService.recordAction(req.valid.params.id, req.valid.body) })
}

export async function undoAction(req, res) {
  res.json({ success: true, data: await recallService.undoAction(req.valid.params.id, req.valid.body) })
}

export async function editRecall(req, res) {
  res.json({ success: true, data: await recallService.editRecall(req.valid.params.id, req.valid.body) })
}

export async function restartRecall(req, res) {
  res.json({ success: true, data: await recallService.restartRecall(req.valid.params.id, req.valid.body) })
}
