import { prisma } from '../lib/prisma.js'
import { ServiceUnavailableError } from '../errors/AppError.js'

export async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    const error = new ServiceUnavailableError('DB_UNAVAILABLE', '資料庫暫時無法連線，請稍後再試')
    error.cause = err
    throw error
  }
}
