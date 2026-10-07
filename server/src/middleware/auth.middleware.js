import { verifyToken } from '../services/auth.service.js'
import { UnauthorizedError } from '../errors/AppError.js'

export const TOKEN_COOKIE = 'token'

export function requireAuth(req, res, next) {
  const token = req.cookies?.[TOKEN_COOKIE]
  if (!token) throw new UnauthorizedError('UNAUTHORIZED', '請先登入')
  req.user = verifyToken(token)
  next()
}
