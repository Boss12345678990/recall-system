import express from 'express'
import cookieParser from 'cookie-parser'
import { requestLogger } from './middleware/requestLogger.middleware.js'
import { errorHandler } from './middleware/error.middleware.js'
import { NotFoundError } from './errors/AppError.js'
import { apiRouter } from './routes/index.js'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(requestLogger)
  app.use(express.json({ limit: '5mb' }))
  app.use(cookieParser())
  app.use('/api', apiRouter())
  app.use('/api', (req, res, next) => next(new NotFoundError('ROUTE_NOT_FOUND', '找不到此 API')))
  app.use(errorHandler)
  return app
}
