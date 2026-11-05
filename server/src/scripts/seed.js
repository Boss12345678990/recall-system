import '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { ensureUser } from '../services/auth.service.js'

const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env

if (!ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('Set ADMIN_USERNAME and ADMIN_PASSWORD (at least 8 characters) in server/.env')
  process.exit(1)
}

try {
  const { created } = await ensureUser(ADMIN_USERNAME, ADMIN_PASSWORD)
  console.log(created ? `Created user "${ADMIN_USERNAME}"` : `User "${ADMIN_USERNAME}" already exists; nothing changed`)
} finally {
  await prisma.$disconnect()
}
