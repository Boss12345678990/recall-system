import '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { resetPassword } from '../services/auth.service.js'

const newPassword = process.argv[2]

if (!newPassword || newPassword.length < 8) {
  console.error('Usage: npm run reset-password -w server -- <new-password>   (at least 8 characters)')
  process.exit(1)
}

try {
  const username = await resetPassword(newPassword)
  console.log(`Password reset for "${username}".`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
