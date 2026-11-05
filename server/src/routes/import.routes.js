import { Router } from 'express'
import multer from 'multer'
import * as importController from '../controllers/import.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { commitSchema } from '../validators/import.validator.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } })

export function importRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.get('/template', importController.downloadTemplate)
  router.post('/preview', upload.single('file'), importController.preview)
  router.post('/commit', validate(commitSchema), importController.commit)
  return router
}
