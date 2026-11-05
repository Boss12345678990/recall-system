import * as settingService from '../services/setting.service.js'

export async function getSettings(req, res) {
  res.json({ success: true, data: await settingService.getSettings() })
}

export async function updateSettings(req, res) {
  res.json({ success: true, data: await settingService.updateSettings(req.valid.body) })
}
