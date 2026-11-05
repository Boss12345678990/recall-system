import { execSync } from 'node:child_process'
import fs from 'node:fs'
import dotenv from 'dotenv'

export default function setup() {
  const testEnv = dotenv.parse(fs.readFileSync('.env.test'))
  if (!testEnv.DATABASE_URL?.includes('test')) {
    throw new Error('Refusing to run: DATABASE_URL in .env.test must point at a database whose name contains "test"')
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, ...testEnv },
  })
}
