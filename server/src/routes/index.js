import { Router } from 'express'
import { healthRoutes } from './health.routes.js'

export function apiRouter() {
  const router = Router()
  router.use('/health', healthRoutes())
  return router
}
