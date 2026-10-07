import * as authService from '../services/auth.service.js'
import { TOKEN_COOKIE } from '../middleware/auth.middleware.js'
import { env } from '../config/env.js'

function baseCookieOptions() {
  return { httpOnly: true, sameSite: 'strict', secure: env.NODE_ENV === 'production', path: '/' }
}

export async function login(req, res) {
  const { username, password } = req.valid.body
  const { token, user } = await authService.login(username, password)
  res.cookie(TOKEN_COOKIE, token, { ...baseCookieOptions(), maxAge: authService.TOKEN_TTL_SECONDS * 1000 })
  res.json({ success: true, data: { user } })
}

export async function logout(req, res) {
  res.clearCookie(TOKEN_COOKIE, baseCookieOptions())
  res.json({ success: true, data: null })
}

export async function me(req, res) {
  res.json({ success: true, data: await authService.getCurrentUser(req.user.id) })
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.valid.body
  await authService.changePassword(req.user.id, currentPassword, newPassword)
  res.json({ success: true, data: null })
}
