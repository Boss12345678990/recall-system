import * as importService from '../services/import.service.js'

export async function downloadTemplate(req, res) {
  const buffer = await importService.buildTemplate()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="recall-import-template.xlsx"')
  res.send(buffer)
}

export async function preview(req, res) {
  res.json({ success: true, data: await importService.previewImport(req.file?.buffer) })
}

export async function commit(req, res) {
  res.status(201).json({ success: true, data: await importService.commitImport(req.valid.body.rows) })
}
