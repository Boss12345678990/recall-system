import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { UnauthorizedError, ValidationError } from '../errors/AppError.js'

export const TOKEN_TTL_SECONDS = 12 * 60 * 60

// Compared against when the username does not exist, so both failures take the same time.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', env.BCRYPT_ROUNDS)

export function hashPassword(password) {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS)
}

export async function login(username, password) {
  const user = await prisma.user.findUnique({ where: { username } })
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !valid) throw new UnauthorizedError('INVALID_CREDENTIALS', '帳號或密碼錯誤')
  const token = jwt.sign({ sub: String(user.id), username: user.username }, env.JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
  })
  return { token, user: { id: user.id, username: user.username } }
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    return { id: Number(payload.sub), username: payload.username }
  } catch {
    throw new UnauthorizedError('UNAUTHORIZED', '請先登入')
  }
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } })
  if (!user) throw new UnauthorizedError('UNAUTHORIZED', '請先登入')
  return user
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new UnauthorizedError('UNAUTHORIZED', '請先登入')
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ValidationError('WRONG_PASSWORD', '目前密碼不正確')
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } })
}

export async function ensureUser(username, password) {
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) return { created: false }
  await prisma.user.create({ data: { username, passwordHash: await hashPassword(password) } })
  return { created: true }
}

// Used only by scripts/reset-password.js; v1 has exactly one shared account.
export async function resetPassword(newPassword) {
  const users = await prisma.user.findMany({ select: { id: true, username: true } })
  if (users.length !== 1) throw new Error(`Expected exactly one user, found ${users.length}`)
  await prisma.user.update({ where: { id: users[0].id }, data: { passwordHash: await hashPassword(newPassword) } })
  return users[0].username
}
