import { Router } from 'express'
import * as visitController from '../controllers/visit.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { visitIdSchema } from '../validators/visit.validator.js'

export function visitRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.delete('/:id', validate(visitIdSchema), visitController.deleteVisit)
  return router
}
