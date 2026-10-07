import { Router } from 'express'
import { healthRoutes } from './health.routes.js'
import { authRoutes } from './auth.routes.js'
import { settingRoutes } from './setting.routes.js'
import { patientRoutes } from './patient.routes.js'
import { visitRoutes } from './visit.routes.js'
import { recallRoutes } from './recall.routes.js'

export function apiRouter() {
  const router = Router()
  router.use('/health', healthRoutes())
  router.use('/auth', authRoutes())
  router.use('/settings', settingRoutes())
  router.use('/patients', patientRoutes())
  router.use('/visits', visitRoutes())
  router.use('/recalls', recallRoutes())
  return router
}
