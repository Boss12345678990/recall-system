import fs from 'node:fs'
import dotenv from 'dotenv'
import { defineConfig } from 'vitest/config'

const testEnv = fs.existsSync('.env.test') ? dotenv.parse(fs.readFileSync('.env.test')) : {}

export default defineConfig({
  test: {
    env: { ...testEnv, NODE_ENV: 'test' },
    fileParallelism: false,
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.js'] } },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.js'],
          globalSetup: ['tests/integration/globalSetup.js'],
          setupFiles: ['tests/integration/setup.js'],
          hookTimeout: 60_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
