import { Router } from 'express'
import * as settingController from '../controllers/setting.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { updateSettingsSchema } from '../validators/setting.validator.js'

export function settingRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.get('/', settingController.getSettings)
  router.patch('/', validate(updateSettingsSchema), settingController.updateSettings)
  return router
}
