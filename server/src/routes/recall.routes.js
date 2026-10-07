import { Router } from 'express'
import * as recallController from '../controllers/recall.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { listSchema, actionSchema, undoSchema, editSchema, restartSchema } from '../validators/recall.validator.js'

export function recallRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.get('/today', recallController.getToday)
  router.get('/', validate(listSchema), recallController.getList)
  router.post('/:id/actions', validate(actionSchema), recallController.recordAction)
  router.post('/:id/undo', validate(undoSchema), recallController.undoAction)
  router.patch('/:id', validate(editSchema), recallController.editRecall)
  router.post('/:id/restart', validate(restartSchema), recallController.restartRecall)
  return router
}
