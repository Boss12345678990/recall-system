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
    ],
  },
})
