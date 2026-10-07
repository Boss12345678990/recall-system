import * as patientService from '../services/patient.service.js'

export async function listPatients(req, res) {
  res.json({ success: true, data: await patientService.listPatients(req.valid.query) })
}

export async function getPatient(req, res) {
  res.json({ success: true, data: await patientService.getPatient(req.valid.params.id) })
}

export async function createPatient(req, res) {
  res.status(201).json({ success: true, data: await patientService.createPatient(req.valid.body) })
}

export async function updatePatient(req, res) {
  res.json({ success: true, data: await patientService.updatePatient(req.valid.params.id, req.valid.body) })
}

export async function deletePatient(req, res) {
  await patientService.deletePatient(req.valid.params.id)
  res.json({ success: true, data: null })
}
