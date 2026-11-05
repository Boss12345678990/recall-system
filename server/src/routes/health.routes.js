import { Router } from 'express'
import * as healthController from '../controllers/health.controller.js'

export function healthRoutes() {
  const router = Router()
  router.get('/', healthController.getHealth)
  return router
}
