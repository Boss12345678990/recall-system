import { env } from '../config/env.js'
import { prisma } from '../lib/prisma.js'
import { seedDemoData } from './demoData.js'

if (env.NODE_ENV === 'production') {
  console.error('Refusing to load demo data with NODE_ENV=production.')
  process.exit(1)
}

try {
  const { removed, created } = await seedDemoData()
  console.log(`Demo data loaded: removed ${removed} old demo patients, created ${created}.`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
