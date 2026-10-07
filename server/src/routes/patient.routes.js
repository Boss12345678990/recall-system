import { Router } from 'express'
import * as patientController from '../controllers/patient.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import {
  listPatientsSchema, patientIdSchema, createPatientSchema, updatePatientSchema,
} from '../validators/patient.validator.js'

export function patientRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.get('/', validate(listPatientsSchema), patientController.listPatients)
  router.post('/', validate(createPatientSchema), patientController.createPatient)
  router.get('/:id', validate(patientIdSchema), patientController.getPatient)
  router.patch('/:id', validate(updatePatientSchema), patientController.updatePatient)
  router.delete('/:id', validate(patientIdSchema), patientController.deletePatient)
  return router
}
