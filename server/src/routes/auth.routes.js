import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import * as authController from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { loginSchema, changePasswordSchema } from '../validators/auth.validator.js'
import { TooManyRequestsError } from '../errors/AppError.js'

export function authRoutes() {
  const router = Router()
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new TooManyRequestsError('TOO_MANY_ATTEMPTS', '登入嘗試次數過多，請 15 分鐘後再試')),
  })
  router.post('/login', loginLimiter, validate(loginSchema), authController.login)
  router.post('/logout', authController.logout)
  router.get('/me', requireAuth, authController.me)
  router.patch('/password', requireAuth, validate(changePasswordSchema), authController.changePassword)
  return router
}
