import { pinoHttp } from 'pino-http'
import { logger } from '../lib/logger.js'

export function createRequestLogger(baseLogger = logger) {
  return pinoHttp({
    logger: baseLogger,
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    // Headers carry the session cookie and query strings carry patient names/phones; log neither.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
}

export const requestLogger = createRequestLogger()
