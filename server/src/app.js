import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import { requestLogger } from './middleware/requestLogger.middleware.js'
import { errorHandler } from './middleware/error.middleware.js'
import { NotFoundError } from './errors/AppError.js'
import { apiRouter } from './routes/index.js'

const DEFAULT_CLIENT_DIST = path.resolve(import.meta.dirname, '../../client/dist')

export function createApp({ clientDist = DEFAULT_CLIENT_DIST } = {}) {
  const app = express()
  app.set('trust proxy', 1)
  app.use(requestLogger)
  app.use(express.json({ limit: '5mb' }))
  app.use(cookieParser())
  app.use('/api', apiRouter())
  app.use('/api', (req, res, next) => next(new NotFoundError('ROUTE_NOT_FOUND', '找不到此 API')))

  // clientDist: null means the static client is served by the host (Vercel), not Express.
  const indexHtml = clientDist && path.join(clientDist, 'index.html')
  if (indexHtml && fs.existsSync(indexHtml)) {
    app.use(express.static(clientDist, { index: false, maxAge: '7d' }))
    app.get('/{*splat}', (req, res) => {
      res.set('Cache-Control', 'no-cache')
      res.sendFile(indexHtml)
    })
  }

  app.use(errorHandler)
  return app
}
