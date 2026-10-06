# Dental Recall System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the clinic's internal recall system — a zh-TW web app that tells reception staff who to LINE or phone today, records each contact in one click, and imports existing paper records from Excel.

**Architecture:** npm-workspaces monorepo. `server/` is Express 5 + Prisma 6 + MySQL with strict route → controller → service → Prisma layering; recall rules are pure functions in `server/src/domain/`. `client/` is React 19 + Vite + TanStack Query + Tailwind 4. In production Express serves the built client and the API as one service.

**Tech Stack:** Node ≥ 22 (ESM), Express 5, Prisma 6, MySQL 8, Zod 3, bcryptjs, jsonwebtoken, pino, dayjs, exceljs, multer 2, Vitest 3, Supertest, React 19, React Router 7, TanStack Query 5, Tailwind CSS 4, Testing Library.

**Spec:** [docs/superpowers/specs/2026-10-06-dental-recall-system-design.md](../specs/2026-10-06-dental-recall-system-design.md) — read it alongside this plan. Also read [CLAUDE.md](../../../CLAUDE.md).

## Global Constraints

- Node ≥ 22; every package uses `"type": "module"` (ESM).
- Pin majors: Prisma **6** (not 7), Express **5**, Zod **3**, Vitest **3**, React **19**, React Router **7**, TanStack Query **5**, Tailwind **4**.
- All user-facing text (UI, validation and error messages) is Traditional Chinese (zh-TW). Identifiers, enum values, API error `code`s and comments are English.
- Backend flow is route → controller → service → Prisma. Controllers never touch Prisma; services never see `req`/`res`; services throw `AppError` subclasses.
- Response envelope: `{ success: true, data }` / `{ success: false, error: { code, message, details? } }`. A failed operation never returns 2xx.
- Dates are `'YYYY-MM-DD'` strings in the API and domain code, `@db.Date` in MySQL. "Today" is `Asia/Taipei`, from `todayInClinic()`.
- Passwords are bcrypt-hashed; never stored or logged in plain text.
- Frontend follows the CLAUDE.md layout principle: uncluttered, spaced cards, details one level down.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).
- All commands run from the repo root unless a step says otherwise. Shell is Git Bash on Windows.

## Review Focus

1. **Excel phone cells typed as numbers** lose the leading `0` (`912345678`) — the import must restore `0912345678`, not reject it. Pinned in Task 10.
2. **Server clock in UTC** — between 00:00 and 08:00 Taipei time, "today" must already be the new Taipei date. Pinned in Task 1.
3. **DATE round trip** — a birth date saved as `1990-01-01` must come back as `1990-01-01`, never shifted by a timezone. Pinned in Task 7.
4. **Double click / two staff on one card** — a second request carrying the same `version` must get 409 and must not record a second call. Pinned in Task 9.
5. **Names with leading/trailing spaces (including full-width `　`)** must not slip past duplicate detection as a "different" patient. Pinned in Task 7 and Task 10.

## File Map

```text
package.json                         # workspaces, root scripts
server/
  package.json  vitest.config.js  .env.example  .env.test.example
  prisma/schema.prisma
  src/
    app.js  server.js
    config/env.js
    lib/        prisma.js  logger.js  dates.js
    errors/     AppError.js
    domain/     recallRules.js  importRows.js  patientRules.js
    mappers/    patient.mapper.js  recall.mapper.js
    validators/ common.js  auth|setting|patient|visit|recall|import .validator.js
    middleware/ validate|error|requestLogger|auth .middleware.js
    services/   health|auth|setting|patient|visit|recall|import .service.js
    controllers/health|auth|setting|patient|visit|recall|import .controller.js
    routes/     index.js  health|auth|setting|patient|visit|recall|import .routes.js
    scripts/    seed.js  reset-password.js
  tests/
    unit/         dates|errors|validate|app|recallRules|importRows .test.js
    integration/  globalSetup.js  setup.js  helpers/{db,auth,factories,xlsx}.js  *.test.js
client/
  package.json  vite.config.js  index.html
  src/
    main.jsx  App.jsx  index.css  labels.js
    services/api.js
    hooks/      useAuth|useRecalls|usePatients|useSettings|useImport|useDebouncedValue .js
    utils/      format.js  recallActions.js  describeEvent.js
    components/ Button Field Modal ConfirmDialog PageMessage Toast Layout RequireAuth
                ProgressDots RecallCard ActionButtons RestartControl PatientForm
                RegisterVisitDialog RecallEditor RecallTimeline (.jsx)
    pages/      Login Dashboard RecallList Patients PatientDetail Import Settings (Page.jsx)
    test/       setup.js  render.jsx
```

---

## Phase 1 — Backend

### Task 1: Monorepo and server skeleton

**Files:**
- Create: `package.json`, `server/package.json`, `server/vitest.config.js`, `server/.env.example`, `server/.env.test.example`
- Create: `server/src/config/env.js`, `server/src/lib/logger.js`, `server/src/lib/dates.js`, `server/src/errors/AppError.js`
- Create: `server/src/validators/common.js`, `server/src/middleware/validate.middleware.js`, `server/src/middleware/error.middleware.js`, `server/src/middleware/requestLogger.middleware.js`
- Create: `server/src/routes/index.js`, `server/src/app.js`, `server/src/server.js`
- Modify: `.gitignore`
- Test: `server/tests/unit/dates.test.js`, `server/tests/unit/errors.test.js`, `server/tests/unit/validate.test.js`, `server/tests/unit/app.test.js`

**Interfaces:**
- Produces: `env` (`NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, BCRYPT_ROUNDS, LOG_LEVEL`); `logger`; `todayInClinic(now?) → 'YYYY-MM-DD'`, `addDays(date, n)`, `addMonths(date, n)`, `diffDays(later, earlier) → int`, `toDbDate(str|null) → Date|null`, `fromDbDate(Date|null) → str|null`, `isValidDateString(x) → bool`; `AppError(status, code, message, details?)` and subclasses `ValidationError|ConflictError(code, message, details?)`, `UnauthorizedError|NotFoundError|TooManyRequestsError|ServiceUnavailableError(code, message)`; `requestSchema({params, query, body})`, `idParams`, `dateString`, `pastOrTodayDate`; `validate(schema)` (puts parsed data on `req.valid`); `errorHandler`, `toErrorResponse(err)`; `apiRouter()`; `createApp()`.

- [ ] **Step 1: Create root and server package files and install dependencies**

`package.json`:
```json
{
  "name": "recall-system",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["server"],
  "scripts": {
    "dev:server": "npm run dev -w server",
    "test": "npm test -w server"
  }
}
```

`server/package.json`:
```json
{
  "name": "@recall/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "prisma migrate deploy && node src/server.js",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "prisma:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "node src/scripts/seed.js",
    "reset-password": "node src/scripts/reset-password.js"
  }
}
```

Run:
```bash
npm install -w server express@^5 cookie-parser@^1 dotenv@^16 zod@^3 pino@^9 pino-http@^10 dayjs@^1
npm install -w server -D vitest@^3 supertest@^7
```

Append to `.gitignore`:
```text
!.env.test.example
```

`server/.env.example`:
```text
DATABASE_URL="mysql://root:password@localhost:3306/recall_dev"
JWT_SECRET="replace-with-a-random-string-of-at-least-32-characters"
PORT=3000
ADMIN_USERNAME="clinic"
ADMIN_PASSWORD="change-me-please"
```

`server/.env.test.example`:
```text
DATABASE_URL="mysql://root:password@localhost:3306/recall_test"
JWT_SECRET="test-secret-test-secret-test-secret-1234"
BCRYPT_ROUNDS=4
```

Copy both to `server/.env` and `server/.env.test`. **Ask the user for their local MySQL username/password** and fill them in; the test database name must contain `test`.

`server/vitest.config.js` (the integration project is added in Task 2):
```js
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
```

- [ ] **Step 2: Write the failing tests**

`server/tests/unit/dates.test.js`:
```js
import { describe, it, expect } from 'vitest'
import {
  todayInClinic, addDays, addMonths, diffDays, toDbDate, fromDbDate, isValidDateString,
} from '../../src/lib/dates.js'

describe('todayInClinic', () => {
  it('uses the Taipei date while UTC is still on the previous day', () => {
    expect(todayInClinic(new Date('2026-10-05T17:00:00Z'))).toBe('2026-10-06')
  })
  it('stays on the Taipei date until Taipei midnight', () => {
    expect(todayInClinic(new Date('2026-10-06T15:59:59Z'))).toBe('2026-10-06')
  })
})

describe('date math', () => {
  it('adds days across a month boundary', () => expect(addDays('2026-09-28', 5)).toBe('2026-10-03'))
  it('subtracts days', () => expect(addDays('2026-10-03', -7)).toBe('2026-09-26'))
  it('clamps addMonths to the end of the month', () => {
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28')
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29')
  })
  it('diffDays is later minus earlier', () => {
    expect(diffDays('2026-10-06', '2026-10-04')).toBe(2)
    expect(diffDays('2026-10-04', '2026-10-06')).toBe(-2)
  })
})

describe('DB date conversion', () => {
  it('round trips a date string', () => expect(fromDbDate(toDbDate('1990-01-01'))).toBe('1990-01-01'))
  it('passes null through', () => {
    expect(toDbDate(null)).toBeNull()
    expect(fromDbDate(null)).toBeNull()
  })
})

describe('isValidDateString', () => {
  it.each(['2026-10-06', '2028-02-29'])('accepts %s', (s) => expect(isValidDateString(s)).toBe(true))
  it.each(['2026-02-30', '2026-13-01', '2026/10/06', '20261006', '', null, 20261006])(
    'rejects %s', (s) => expect(isValidDateString(s)).toBe(false),
  )
})
```

`server/tests/unit/errors.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { toErrorResponse } from '../../src/middleware/error.middleware.js'
import { ConflictError, NotFoundError } from '../../src/errors/AppError.js'

describe('toErrorResponse', () => {
  it('passes AppError through', () => {
    expect(toErrorResponse(new ConflictError('X', '衝突', { a: 1 })))
      .toEqual({ status: 409, code: 'X', message: '衝突', details: { a: 1 } })
    expect(toErrorResponse(new NotFoundError('NF', '找不到'))).toMatchObject({ status: 404, code: 'NF' })
  })
  it('maps malformed JSON to 400', () => {
    expect(toErrorResponse({ type: 'entity.parse.failed' })).toMatchObject({ status: 400, code: 'INVALID_JSON' })
  })
  it('maps Prisma unique violation to 409', () => {
    expect(toErrorResponse({ code: 'P2002' })).toMatchObject({ status: 409, code: 'DUPLICATE' })
  })
  it('maps Prisma record-not-found to 404', () => {
    expect(toErrorResponse({ code: 'P2025' })).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
  it('maps database connection failures to 503', () => {
    expect(toErrorResponse({ code: 'P1001' })).toMatchObject({ status: 503, code: 'DB_UNAVAILABLE' })
    expect(toErrorResponse({ name: 'PrismaClientInitializationError' })).toMatchObject({ status: 503 })
  })
  it('maps anything else to a zh-TW 500', () => {
    expect(toErrorResponse(new Error('boom')))
      .toEqual({ status: 500, code: 'INTERNAL_ERROR', message: '系統發生錯誤，請稍後再試' })
  })
})
```

`server/tests/unit/validate.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { validate } from '../../src/middleware/validate.middleware.js'
import { requestSchema, idParams, dateString } from '../../src/validators/common.js'
import { ValidationError } from '../../src/errors/AppError.js'

const schema = requestSchema({ params: idParams, body: z.object({ visitDate: dateString }) })

describe('validate middleware', () => {
  it('stores parsed values on req.valid and calls next', () => {
    const req = { params: { id: '42' }, query: {}, body: { visitDate: '2026-10-06' } }
    const next = vi.fn()
    validate(schema)(req, {}, next)
    expect(req.valid.params.id).toBe(42)
    expect(next).toHaveBeenCalledOnce()
  })

  it('throws a ValidationError with zh-TW per-field details', () => {
    const req = { params: { id: 'abc' }, query: {}, body: {} }
    let error
    try { validate(schema)(req, {}, vi.fn()) } catch (e) { error = e }
    expect(error).toBeInstanceOf(ValidationError)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.details).toEqual(expect.arrayContaining([
      { field: 'id', message: '格式錯誤' },
      { field: 'visitDate', message: '此欄位為必填' },
    ]))
  })

  it('rejects impossible dates', () => {
    const req = { params: { id: '1' }, query: {}, body: { visitDate: '2026-02-30' } }
    expect(() => validate(schema)(req, {}, vi.fn())).toThrow('日期格式錯誤，應為 YYYY-MM-DD')
  })
})
```

`server/tests/unit/app.test.js`:
```js
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'

describe('app', () => {
  it('returns a JSON 404 envelope for unknown API routes', async () => {
    const res = await request(createApp()).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ success: false, error: { code: 'ROUTE_NOT_FOUND', message: '找不到此 API' } })
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await request(createApp())
      .post('/api/anything').set('Content-Type', 'application/json').send('{"broken"')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_JSON')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit -w server`
Expected: FAIL — modules such as `../../src/lib/dates.js` not found.

- [ ] **Step 4: Implement**

`server/src/config/env.js`:
```js
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  LOG_LEVEL: z.string().optional(),
})

export const env = envSchema.parse(process.env)
```

`server/src/lib/logger.js`:
```js
import pino from 'pino'
import { env } from '../config/env.js'

export const logger = pino({ level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info') })
```

`server/src/lib/dates.js`:
```js
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

export const CLINIC_TIMEZONE = 'Asia/Taipei'
const FORMAT = 'YYYY-MM-DD'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function todayInClinic(now = new Date()) {
  return dayjs(now).tz(CLINIC_TIMEZONE).format(FORMAT)
}

export function addDays(date, days) {
  return dayjs.utc(date).add(days, 'day').format(FORMAT)
}

// dayjs clamps to the last day of the month (Aug 31 + 6 months = Feb 28/29).
export function addMonths(date, months) {
  return dayjs.utc(date).add(months, 'month').format(FORMAT)
}

export function diffDays(later, earlier) {
  return dayjs.utc(later).diff(dayjs.utc(earlier), 'day')
}

export function isValidDateString(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value) && dayjs.utc(value).format(FORMAT) === value
}

// MySQL DATE columns map to JS Dates at UTC midnight.
export function toDbDate(date) {
  return date == null ? null : new Date(`${date}T00:00:00.000Z`)
}

export function fromDbDate(date) {
  return date == null ? null : date.toISOString().slice(0, 10)
}
```

`server/src/errors/AppError.js`:
```js
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = code
    this.details = details
  }
}

export class ValidationError extends AppError {
  constructor(code, message, details) { super(400, code, message, details) }
}

export class UnauthorizedError extends AppError {
  constructor(code, message) { super(401, code, message) }
}

export class NotFoundError extends AppError {
  constructor(code, message) { super(404, code, message) }
}

export class ConflictError extends AppError {
  constructor(code, message, details) { super(409, code, message, details) }
}

export class TooManyRequestsError extends AppError {
  constructor(code, message) { super(429, code, message) }
}

export class ServiceUnavailableError extends AppError {
  constructor(code, message) { super(503, code, message) }
}
```

`server/src/validators/common.js`:
```js
import { z } from 'zod'
import { isValidDateString, todayInClinic } from '../lib/dates.js'

// Default zh-TW messages; schemas pass their own message where a generic one would be unclear.
z.setErrorMap((issue) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? '此欄位為必填' : '格式錯誤' }
    case z.ZodIssueCode.invalid_enum_value:
      return { message: '不是允許的選項' }
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: issue.minimum === 1 ? '此欄位為必填' : `至少 ${issue.minimum} 個字` }
      return { message: `不可小於 ${issue.minimum}` }
    case z.ZodIssueCode.too_big:
      return { message: issue.type === 'string' ? `最多 ${issue.maximum} 個字` : `不可大於 ${issue.maximum}` }
    case z.ZodIssueCode.unrecognized_keys:
      return { message: '含有不允許的欄位' }
    default:
      return { message: '格式錯誤' }
  }
})

export function requestSchema({ params = z.any(), query = z.any(), body = z.any() } = {}) {
  return z.object({ params, query, body })
}

export const idParams = z.object({ id: z.coerce.number().int().positive() })

export const dateString = z.string().refine(isValidDateString, { message: '日期格式錯誤，應為 YYYY-MM-DD' })

export const pastOrTodayDate = z.string().superRefine((value, ctx) => {
  if (!isValidDateString(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '日期格式錯誤，應為 YYYY-MM-DD' })
  else if (value > todayInClinic()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '日期不可晚於今天' })
})
```

`server/src/middleware/validate.middleware.js`:
```js
import { ValidationError } from '../errors/AppError.js'

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({ params: req.params, query: req.query, body: req.body ?? {} })
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.slice(1).join('.'),
        message: issue.message,
      }))
      throw new ValidationError('VALIDATION_ERROR', details[0]?.message ?? '輸入資料有誤', details)
    }
    // Express 5 makes req.query read-only, so parsed input lives on req.valid.
    req.valid = result.data
    next()
  }
}
```

`server/src/middleware/error.middleware.js`:
```js
import { AppError } from '../errors/AppError.js'
import { logger } from '../lib/logger.js'

const DB_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017'])

export function toErrorResponse(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details }
  }
  if (err?.type === 'entity.parse.failed') return { status: 400, code: 'INVALID_JSON', message: '請求格式錯誤' }
  if (err?.type === 'entity.too.large') return { status: 400, code: 'PAYLOAD_TOO_LARGE', message: '資料量過大' }
  if (err?.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE'
      ? { status: 400, code: 'FILE_TOO_LARGE', message: '檔案不可超過 5 MB' }
      : { status: 400, code: 'UPLOAD_ERROR', message: '檔案上傳失敗' }
  }
  if (err?.code === 'P2002') return { status: 409, code: 'DUPLICATE', message: '資料重複，請重新整理後再試' }
  if (err?.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: '找不到資料' }
  if (err?.name === 'PrismaClientInitializationError' || DB_UNAVAILABLE_CODES.has(err?.code)) {
    return { status: 503, code: 'DB_UNAVAILABLE', message: '資料庫暫時無法連線，請稍後再試' }
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: '系統發生錯誤，請稍後再試' }
}

export function errorHandler(err, req, res, next) {
  const { status, code, message, details } = toErrorResponse(err)
  const log = req.log ?? logger
  if (status >= 500) log.error({ err }, 'request failed')
  else log.warn({ code, details }, 'request rejected')
  if (res.headersSent) return next(err)
  const error = details === undefined ? { code, message } : { code, message, details }
  res.status(status).json({ success: false, error })
}
```

`server/src/middleware/requestLogger.middleware.js`:
```js
import { pinoHttp } from 'pino-http'
import { logger } from '../lib/logger.js'

export const requestLogger = pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
})
```

`server/src/routes/index.js`:
```js
import { Router } from 'express'

export function apiRouter() {
  const router = Router()
  return router
}
```

`server/src/app.js`:
```js
import express from 'express'
import cookieParser from 'cookie-parser'
import { requestLogger } from './middleware/requestLogger.middleware.js'
import { errorHandler } from './middleware/error.middleware.js'
import { NotFoundError } from './errors/AppError.js'
import { apiRouter } from './routes/index.js'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(requestLogger)
  app.use(express.json({ limit: '5mb' }))
  app.use(cookieParser())
  app.use('/api', apiRouter())
  app.use('/api', (req, res, next) => next(new NotFoundError('ROUTE_NOT_FOUND', '找不到此 API')))
  app.use(errorHandler)
  return app
}
```

`server/src/server.js`:
```js
import { createApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'

createApp().listen(env.PORT, () => logger.info(`Server listening on port ${env.PORT}`))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -w server`
Expected: PASS (all 4 files).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore server
git commit -m "feat(server): scaffold express app with error envelope, validation and Taipei dates" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Prisma schema, test database harness and health check

**Files:**
- Create: `server/prisma/schema.prisma`, `server/src/lib/prisma.js`
- Create: `server/src/services/health.service.js`, `server/src/controllers/health.controller.js`, `server/src/routes/health.routes.js`
- Create: `server/tests/integration/globalSetup.js`, `server/tests/integration/setup.js`, `server/tests/integration/helpers/db.js`
- Modify: `server/vitest.config.js`, `server/src/routes/index.js`
- Test: `server/tests/integration/health.test.js`

**Interfaces:**
- Consumes: `createApp`, `ServiceUnavailableError`, `toDbDate`.
- Produces: Prisma models `User, Patient, Visit, Recall, RecallEvent, ClinicSetting`; enums `RecallStep, RecallStatus, RecallEventType`; `prisma` singleton; `resetDb()` test helper; `GET /api/health`.

- [ ] **Step 1: Install Prisma and write the schema**

Prisma goes in `dependencies` (not dev) because production start runs `prisma migrate deploy`.

```bash
npm install -w server prisma@^6 @prisma/client@^6
```

`server/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id           Int      @id @default(autoincrement())
  username     String   @unique @db.VarChar(50)
  passwordHash String   @db.VarChar(100)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Patient {
  id          Int      @id @default(autoincrement())
  name        String   @db.VarChar(50)
  phoneNumber String   @db.VarChar(10)
  birthDate   DateTime @db.Date
  hasLine     Boolean  @default(true)
  comment     String?  @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  visits      Visit[]
  recalls     Recall[]

  @@unique([name, birthDate])
}

model Visit {
  id        Int      @id @default(autoincrement())
  patientId Int
  patient   Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
  visitDate DateTime @db.Date
  note      String?  @db.VarChar(500)
  createdAt DateTime @default(now())
  recall    Recall?

  @@unique([patientId, visitDate])
}

enum RecallStep {
  NOT_CONTACTED
  LINE_SENT
  CALLED_1
  CALLED_2
  CALLED_3
}

enum RecallStatus {
  PENDING
  CONFIRMED
  UNREACHABLE
  COMPLETED
}

model Recall {
  id          Int           @id @default(autoincrement())
  patientId   Int
  patient     Patient       @relation(fields: [patientId], references: [id], onDelete: Cascade)
  visitId     Int           @unique
  visit       Visit         @relation(fields: [visitId], references: [id], onDelete: Cascade)
  dueDate     DateTime      @db.Date
  step        RecallStep    @default(NOT_CONTACTED)
  status      RecallStatus  @default(PENDING)
  lineSentAt  DateTime?     @db.Date
  call1At     DateTime?     @db.Date
  call2At     DateTime?     @db.Date
  call3At     DateTime?     @db.Date
  confirmedAt DateTime?     @db.Date
  onHold      Boolean       @default(false)
  version     Int           @default(0)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  events      RecallEvent[]

  @@index([status, onHold])
  @@index([patientId])
}

enum RecallEventType {
  ACTION
  MANUAL_EDIT
  UNDO
  VISIT_RECORDED
  RESTART
}

model RecallEvent {
  id        Int             @id @default(autoincrement())
  recallId  Int
  recall    Recall          @relation(fields: [recallId], references: [id], onDelete: Cascade)
  type      RecallEventType
  action    String?         @db.VarChar(20)
  note      String?         @db.VarChar(500)
  before    Json
  after     Json
  createdAt DateTime        @default(now())

  @@index([recallId, id])
}

model ClinicSetting {
  id                   Int      @id @default(1)
  recallIntervalMonths Int      @default(6)
  lineLeadDays         Int      @default(7)
  callAfterLineDays    Int      @default(3)
  callGapDays          Int      @default(2)
  updatedAt            DateTime @updatedAt
}
```

- [ ] **Step 2: Create the initial migration against the dev database**

Run (from `server/`): `cd server && npx prisma migrate dev --name init && cd ..`
Expected: `server/prisma/migrations/<timestamp>_init/migration.sql` created and applied; Prisma Client generated.

- [ ] **Step 3: Add the test harness**

`server/src/lib/prisma.js`:
```js
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
```

`server/tests/integration/globalSetup.js`:
```js
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import dotenv from 'dotenv'

export default function setup() {
  const testEnv = dotenv.parse(fs.readFileSync('.env.test'))
  if (!testEnv.DATABASE_URL?.includes('test')) {
    throw new Error('Refusing to reset: DATABASE_URL in .env.test must point at a database whose name contains "test"')
  }
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, ...testEnv },
  })
}
```

`server/tests/integration/setup.js`:
```js
import { afterAll } from 'vitest'
import { prisma } from '../../src/lib/prisma.js'

afterAll(async () => {
  await prisma.$disconnect()
})
```

`server/tests/integration/helpers/db.js`:
```js
import { prisma } from '../../../src/lib/prisma.js'

export async function resetDb() {
  await prisma.recallEvent.deleteMany()
  await prisma.recall.deleteMany()
  await prisma.visit.deleteMany()
  await prisma.patient.deleteMany()
  await prisma.user.deleteMany()
  await prisma.clinicSetting.deleteMany()
}
```

Replace the `projects` array in `server/vitest.config.js` with:
```js
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
```

- [ ] **Step 4: Write the failing test**

`server/tests/integration/health.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/lib/prisma.js'
import { toDbDate } from '../../src/lib/dates.js'
import { resetDb } from './helpers/db.js'

describe('GET /api/health', () => {
  it('reports ok when the database is reachable', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } })
  })
})

describe('schema', () => {
  beforeEach(resetDb)

  it('enforces one patient per (name, birthDate)', async () => {
    const data = { name: '王小明', phoneNumber: '0912345678', birthDate: toDbDate('1990-01-01') }
    await prisma.patient.create({ data })
    await expect(prisma.patient.create({ data })).rejects.toMatchObject({ code: 'P2002' })
  })
})
```

- [ ] **Step 5: Run to verify it fails**

Run: `npm run test:integration -w server`
Expected: migrations reset the test DB, then the health test FAILS with 404 `ROUTE_NOT_FOUND`; the schema test passes.

- [ ] **Step 6: Implement the health check**

`server/src/services/health.service.js`:
```js
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
```

`server/src/controllers/health.controller.js`:
```js
import * as healthService from '../services/health.service.js'

export async function getHealth(req, res) {
  await healthService.checkDatabase()
  res.json({ success: true, data: { status: 'ok' } })
}
```

`server/src/routes/health.routes.js`:
```js
import { Router } from 'express'
import * as healthController from '../controllers/health.controller.js'

export function healthRoutes() {
  const router = Router()
  router.get('/', healthController.getHealth)
  return router
}
```

In `server/src/routes/index.js` add the import and mount it:
```js
import { Router } from 'express'
import { healthRoutes } from './health.routes.js'

export function apiRouter() {
  const router = Router()
  router.use('/health', healthRoutes())
  return router
}
```

- [ ] **Step 7: Run all server tests**

Run: `npm test -w server`
Expected: PASS (unit + integration).

- [ ] **Step 8: Commit**

```bash
git add server
git commit -m "feat(server): add prisma schema, test database harness and health check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Recall rules — next action and urgency

**Files:**
- Create: `server/src/domain/recallRules.js`
- Test: `server/tests/unit/recallRules.test.js`

**Interfaces:**
- Consumes: `addDays`, `diffDays` from `lib/dates.js`.
- Produces (all pure; recalls are plain objects with string dates):
  - `STEPS` — `['NOT_CONTACTED','LINE_SENT','CALLED_1','CALLED_2','CALLED_3']`
  - `STEP_DATE_FIELD` — `{ LINE_SENT:'lineSentAt', CALLED_1:'call1At', CALLED_2:'call2At', CALLED_3:'call3At' }`
  - `nextAction(recall, hasLine, settings) → { action: 'SEND_LINE'|'CALL_1'|'CALL_2'|'CALL_3', actionDate } | null`
  - `overdueDays(actionDate, today) → int ≥ 0`
  - `withNextAction(recall, hasLine, settings, today) → { ...recall, nextAction: { action, actionDate, overdueDays } | null }`
  - `compareUrgency(a, b)` over items shaped `{ dueDate, nextAction, patient: { name } }`
  - `buildTodayItems(items, settings, today)` — `items` are recalls with `.patient` (`{ id, name, phoneNumber, hasLine }`); returns due items with `nextAction`, sorted.
  - `settings` shape everywhere: `{ recallIntervalMonths, lineLeadDays, callAfterLineDays, callGapDays }`.

- [ ] **Step 1: Write the failing tests**

`server/tests/unit/recallRules.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { nextAction, overdueDays, buildTodayItems } from '../../src/domain/recallRules.js'

const SETTINGS = { recallIntervalMonths: 6, lineLeadDays: 7, callAfterLineDays: 3, callGapDays: 2 }

function recall(overrides = {}) {
  return {
    id: 1, dueDate: '2026-10-13', step: 'NOT_CONTACTED', status: 'PENDING', onHold: false,
    lineSentAt: null, call1At: null, call2At: null, call3At: null, confirmedAt: null, version: 0,
    ...overrides,
  }
}

describe('nextAction', () => {
  it('sends LINE lineLeadDays before the due date', () => {
    expect(nextAction(recall(), true, SETTINGS)).toEqual({ action: 'SEND_LINE', actionDate: '2026-10-06' })
  })
  it('goes straight to call 1 for patients without LINE', () => {
    expect(nextAction(recall(), false, SETTINGS)).toEqual({ action: 'CALL_1', actionDate: '2026-10-06' })
  })
  it('counts call 1 from the actual LINE-sent date', () => {
    expect(nextAction(recall({ step: 'LINE_SENT', lineSentAt: '2026-10-08' }), true, SETTINGS))
      .toEqual({ action: 'CALL_1', actionDate: '2026-10-11' })
  })
  it('schedules call 2 callGapDays after call 1', () => {
    expect(nextAction(recall({ step: 'CALLED_1', call1At: '2026-10-11' }), true, SETTINGS))
      .toEqual({ action: 'CALL_2', actionDate: '2026-10-13' })
  })
  it('schedules call 3 callGapDays after call 2', () => {
    expect(nextAction(recall({ step: 'CALLED_2', call2At: '2026-10-13' }), true, SETTINGS))
      .toEqual({ action: 'CALL_3', actionDate: '2026-10-15' })
  })
  it('has nothing after call 3', () => {
    expect(nextAction(recall({ step: 'CALLED_3' }), true, SETTINGS)).toBeNull()
  })
  it.each(['CONFIRMED', 'UNREACHABLE', 'COMPLETED'])('has nothing when status is %s', (status) => {
    expect(nextAction(recall({ status }), true, SETTINGS)).toBeNull()
  })
  it('has nothing while on hold', () => {
    expect(nextAction(recall({ onHold: true }), true, SETTINGS)).toBeNull()
  })
  it('reads offsets from settings', () => {
    expect(nextAction(recall(), true, { ...SETTINGS, lineLeadDays: 10 }).actionDate).toBe('2026-10-03')
  })
})

describe('overdueDays', () => {
  it('is 0 when the action is due today', () => expect(overdueDays('2026-10-06', '2026-10-06')).toBe(0))
  it('is 0 when the action is in the future', () => expect(overdueDays('2026-10-08', '2026-10-06')).toBe(0))
  it('counts days past the action date', () => expect(overdueDays('2026-10-04', '2026-10-06')).toBe(2))
})

describe('buildTodayItems', () => {
  const TODAY = '2026-10-06'
  const item = (name, overrides, hasLine = true) =>
    ({ ...recall(overrides), patient: { id: 1, name, phoneNumber: '0912345678', hasLine } })

  it('includes items due today and excludes future, confirmed and on-hold ones', () => {
    const items = [
      item('今天', { dueDate: '2026-10-13' }),
      item('明天', { dueDate: '2026-10-14' }),
      item('已確認', { dueDate: '2026-10-13', status: 'CONFIRMED' }),
      item('暫停', { dueDate: '2026-09-01', onHold: true }),
    ]
    const result = buildTodayItems(items, SETTINGS, TODAY)
    expect(result.map((i) => i.patient.name)).toEqual(['今天'])
    expect(result[0].nextAction).toEqual({ action: 'SEND_LINE', actionDate: TODAY, overdueDays: 0 })
  })

  it('puts overdue first, then call 3 > call 2 > call 1 > LINE', () => {
    const items = [
      item('LINE', { dueDate: '2026-10-13' }),
      item('第1次', { step: 'LINE_SENT', lineSentAt: '2026-10-03', dueDate: '2026-10-10' }),
      item('第3次', { step: 'CALLED_2', call2At: '2026-10-04', dueDate: '2026-10-09' }),
      item('第2次', { step: 'CALLED_1', call1At: '2026-10-04', dueDate: '2026-10-08' }),
      item('逾期LINE', { dueDate: '2026-10-12' }),
    ]
    const names = buildTodayItems(items, SETTINGS, TODAY).map((i) => i.patient.name)
    expect(names).toEqual(['逾期LINE', '第3次', '第2次', '第1次', 'LINE'])
  })

  it('breaks ties by more overdue days, then nearer due date, then name', () => {
    const items = [
      item('乙', { dueDate: '2026-10-11' }),
      item('甲', { dueDate: '2026-10-11' }),
      item('較逾期', { dueDate: '2026-10-10' }),
      item('較近', { step: 'LINE_SENT', lineSentAt: '2026-10-03', dueDate: '2026-10-08' }),
      item('較遠', { step: 'LINE_SENT', lineSentAt: '2026-10-03', dueDate: '2026-10-09' }),
    ]
    const names = buildTodayItems(items, SETTINGS, TODAY).map((i) => i.patient.name)
    expect(names).toEqual(['較逾期', '甲', '乙', '較近', '較遠'])
  })
})
```

Why these orders hold: in the second test `逾期LINE` is overdue 1 day, so it beats every non-overdue call even though SEND_LINE has the lowest rank. In the third test `較逾期` (overdue 3) precedes `甲`/`乙` (overdue 2, same due date → name order), and the two CALL_1 items are due today (not overdue), nearer due date first.

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run --project unit tests/unit/recallRules.test.js; cd ..`
Expected: FAIL — cannot find `../../src/domain/recallRules.js`.

- [ ] **Step 3: Implement**

`server/src/domain/recallRules.js`:
```js
import { addDays, diffDays } from '../lib/dates.js'

export const STEPS = ['NOT_CONTACTED', 'LINE_SENT', 'CALLED_1', 'CALLED_2', 'CALLED_3']

export const STEP_DATE_FIELD = {
  LINE_SENT: 'lineSentAt',
  CALLED_1: 'call1At',
  CALLED_2: 'call2At',
  CALLED_3: 'call3At',
}

const ACTION_RANK = { CALL_3: 4, CALL_2: 3, CALL_1: 2, SEND_LINE: 1 }

export function nextAction(recall, hasLine, settings) {
  if (recall.status !== 'PENDING' || recall.onHold) return null
  switch (recall.step) {
    case 'NOT_CONTACTED':
      return { action: hasLine ? 'SEND_LINE' : 'CALL_1', actionDate: addDays(recall.dueDate, -settings.lineLeadDays) }
    case 'LINE_SENT':
      return { action: 'CALL_1', actionDate: addDays(recall.lineSentAt, settings.callAfterLineDays) }
    case 'CALLED_1':
      return { action: 'CALL_2', actionDate: addDays(recall.call1At, settings.callGapDays) }
    case 'CALLED_2':
      return { action: 'CALL_3', actionDate: addDays(recall.call2At, settings.callGapDays) }
    default:
      return null
  }
}

export function overdueDays(actionDate, today) {
  return Math.max(0, diffDays(today, actionDate))
}

export function withNextAction(recall, hasLine, settings, today) {
  const next = nextAction(recall, hasLine, settings)
  return { ...recall, nextAction: next && { ...next, overdueDays: overdueDays(next.actionDate, today) } }
}

export function compareUrgency(a, b) {
  const aOverdue = a.nextAction.overdueDays > 0
  const bOverdue = b.nextAction.overdueDays > 0
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
  const byRank = ACTION_RANK[b.nextAction.action] - ACTION_RANK[a.nextAction.action]
  if (byRank !== 0) return byRank
  const byOverdue = b.nextAction.overdueDays - a.nextAction.overdueDays
  if (byOverdue !== 0) return byOverdue
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  return a.patient.name.localeCompare(b.patient.name, 'zh-Hant-TW')
}

export function buildTodayItems(items, settings, today) {
  return items
    .map((item) => withNextAction(item, item.patient.hasLine, settings, today))
    .filter((item) => item.nextAction && item.nextAction.actionDate <= today)
    .sort(compareUrgency)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/recallRules.js server/tests/unit/recallRules.test.js
git commit -m "feat(server): add pure recall next-action and urgency rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Recall rules — transitions

**Files:**
- Modify: `server/src/domain/recallRules.js`
- Test: `server/tests/unit/recallRules.test.js` (append)

**Interfaces:**
- Produces:
  - `MUTABLE_FIELDS` — `['dueDate','step','status','lineSentAt','call1At','call2At','call3At','confirmedAt','onHold']`
  - `snapshot(recall) → object` with exactly `MUTABLE_FIELDS`
  - `applyAction(recall, hasLine, action, today) → patch | null` (`action` ∈ `LINE_SENT|CALL_NO_ANSWER|CONFIRM`; `null` = not allowed)
  - `applyManualEdit(recall, { step?, status?, dueDate? }, today) → { patch } | { error: 'RECALL_COMPLETED' | 'PENDING_AT_CALLED_3' }` (`patch` is the full next snapshot)
  - `canRestart(recall, today) → bool`
  - `restartFields(dueDate) → full snapshot`

- [ ] **Step 1: Write the failing tests**

Change the import at the top of `server/tests/unit/recallRules.test.js` to:
```js
import {
  nextAction, overdueDays, buildTodayItems, applyAction, applyManualEdit, canRestart, restartFields, snapshot,
} from '../../src/domain/recallRules.js'
```

Append:
```js
describe('applyAction', () => {
  const TODAY = '2026-10-06'

  it('records LINE sent from NOT_CONTACTED', () => {
    expect(applyAction(recall(), true, 'LINE_SENT', TODAY)).toEqual({ step: 'LINE_SENT', lineSentAt: TODAY })
  })
  it('refuses LINE for patients without LINE', () => {
    expect(applyAction(recall(), false, 'LINE_SENT', TODAY)).toBeNull()
  })
  it('refuses LINE once a call has been made', () => {
    expect(applyAction(recall({ step: 'CALLED_1' }), true, 'LINE_SENT', TODAY)).toBeNull()
  })
  it.each([
    ['LINE_SENT', { step: 'CALLED_1', call1At: '2026-10-06' }],
    ['CALLED_1', { step: 'CALLED_2', call2At: '2026-10-06' }],
    ['CALLED_2', { step: 'CALLED_3', call3At: '2026-10-06', status: 'UNREACHABLE' }],
  ])('advances a no-answer call from %s', (step, expected) => {
    expect(applyAction(recall({ step }), true, 'CALL_NO_ANSWER', TODAY)).toEqual(expected)
  })
  it('lets patients without LINE be called from NOT_CONTACTED', () => {
    expect(applyAction(recall(), false, 'CALL_NO_ANSWER', TODAY)).toEqual({ step: 'CALLED_1', call1At: TODAY })
  })
  it('refuses a call before LINE was sent to a LINE patient', () => {
    expect(applyAction(recall(), true, 'CALL_NO_ANSWER', TODAY)).toBeNull()
  })
  it('refuses a call after call 3', () => {
    expect(applyAction(recall({ step: 'CALLED_3' }), true, 'CALL_NO_ANSWER', TODAY)).toBeNull()
  })
  it('confirms from any step', () => {
    expect(applyAction(recall({ step: 'CALLED_2' }), true, 'CONFIRM', TODAY))
      .toEqual({ status: 'CONFIRMED', confirmedAt: TODAY })
  })
  it.each([[{ status: 'CONFIRMED' }], [{ status: 'UNREACHABLE' }], [{ onHold: true }]])(
    'refuses every action when %o', (overrides) => {
      expect(applyAction(recall(overrides), true, 'CONFIRM', TODAY)).toBeNull()
    },
  )
})

describe('applyManualEdit', () => {
  const TODAY = '2026-10-06'

  it('fills missing step dates with today when moving forward', () => {
    const { patch } = applyManualEdit(recall({ step: 'LINE_SENT', lineSentAt: '2026-10-01' }), { step: 'CALLED_2' }, TODAY)
    expect(patch).toMatchObject({ step: 'CALLED_2', lineSentAt: '2026-10-01', call1At: TODAY, call2At: TODAY, call3At: null })
  })
  it('clears later step dates when moving backward', () => {
    const start = recall({ step: 'CALLED_2', lineSentAt: '2026-10-01', call1At: '2026-10-03', call2At: '2026-10-05' })
    const { patch } = applyManualEdit(start, { step: 'LINE_SENT' }, TODAY)
    expect(patch).toMatchObject({ step: 'LINE_SENT', lineSentAt: '2026-10-01', call1At: null, call2At: null })
  })
  it('marks UNREACHABLE when moved to call 3 without an explicit status', () => {
    const { patch } = applyManualEdit(recall({ step: 'CALLED_2' }), { step: 'CALLED_3' }, TODAY)
    expect(patch).toMatchObject({ step: 'CALLED_3', status: 'UNREACHABLE' })
  })
  it('rejects PENDING together with call 3', () => {
    expect(applyManualEdit(recall({ step: 'CALLED_3', status: 'UNREACHABLE' }), { status: 'PENDING' }, TODAY))
      .toEqual({ error: 'PENDING_AT_CALLED_3' })
  })
  it('allows PENDING when the step moves back at the same time', () => {
    const start = recall({ step: 'CALLED_3', status: 'UNREACHABLE', call1At: '2026-10-01', call2At: '2026-10-03', call3At: '2026-10-05' })
    const { patch } = applyManualEdit(start, { status: 'PENDING', step: 'CALLED_2' }, TODAY)
    expect(patch).toMatchObject({ status: 'PENDING', step: 'CALLED_2', call3At: null })
  })
  it('sets confirmedAt when confirming', () => {
    expect(applyManualEdit(recall(), { status: 'CONFIRMED' }, TODAY).patch)
      .toMatchObject({ status: 'CONFIRMED', confirmedAt: TODAY })
  })
  it('changes only the due date', () => {
    const { patch } = applyManualEdit(recall(), { dueDate: '2026-11-01' }, TODAY)
    expect(patch).toEqual({ ...snapshot(recall()), dueDate: '2026-11-01' })
  })
  it('refuses to edit a completed recall', () => {
    expect(applyManualEdit(recall({ status: 'COMPLETED' }), { dueDate: '2026-11-01' }, TODAY))
      .toEqual({ error: 'RECALL_COMPLETED' })
  })
})

describe('restart', () => {
  const TODAY = '2026-10-06'

  it.each([
    ['on hold', { onHold: true }, true],
    ['unreachable', { status: 'UNREACHABLE', step: 'CALLED_3' }, true],
    ['confirmed but past due', { status: 'CONFIRMED', dueDate: '2026-10-05' }, true],
    ['confirmed and due today', { status: 'CONFIRMED', dueDate: '2026-10-06' }, false],
    ['pending', {}, false],
    ['completed', { status: 'COMPLETED' }, false],
  ])('canRestart when %s', (label, overrides, expected) => {
    expect(canRestart(recall(overrides), TODAY)).toBe(expected)
  })

  it('restartFields resets the cycle', () => {
    expect(restartFields('2026-10-13')).toEqual({
      dueDate: '2026-10-13', step: 'NOT_CONTACTED', status: 'PENDING', lineSentAt: null,
      call1At: null, call2At: null, call3At: null, confirmedAt: null, onHold: false,
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -w server`
Expected: FAIL — `applyAction is not a function` (and the other new exports).

- [ ] **Step 3: Implement**

Append to `server/src/domain/recallRules.js`:
```js
export const MUTABLE_FIELDS = [
  'dueDate', 'step', 'status', 'lineSentAt', 'call1At', 'call2At', 'call3At', 'confirmedAt', 'onHold',
]

const NEXT_CALL_STEP = { LINE_SENT: 'CALLED_1', CALLED_1: 'CALLED_2', CALLED_2: 'CALLED_3' }

export function snapshot(recall) {
  return Object.fromEntries(MUTABLE_FIELDS.map((field) => [field, recall[field]]))
}

export function applyAction(recall, hasLine, action, today) {
  if (recall.status !== 'PENDING' || recall.onHold) return null
  if (action === 'CONFIRM') return { status: 'CONFIRMED', confirmedAt: today }
  if (action === 'LINE_SENT') {
    return recall.step === 'NOT_CONTACTED' && hasLine ? { step: 'LINE_SENT', lineSentAt: today } : null
  }
  if (action === 'CALL_NO_ANSWER') {
    const nextStep = recall.step === 'NOT_CONTACTED' && !hasLine ? 'CALLED_1' : NEXT_CALL_STEP[recall.step]
    if (!nextStep) return null
    const patch = { step: nextStep, [STEP_DATE_FIELD[nextStep]]: today }
    if (nextStep === 'CALLED_3') patch.status = 'UNREACHABLE'
    return patch
  }
  return null
}

export function applyManualEdit(recall, changes, today) {
  if (recall.status === 'COMPLETED') return { error: 'RECALL_COMPLETED' }
  const next = snapshot(recall)
  if (changes.dueDate !== undefined) next.dueDate = changes.dueDate
  if (changes.step !== undefined && changes.step !== recall.step) {
    const target = STEPS.indexOf(changes.step)
    STEPS.forEach((step, index) => {
      const field = STEP_DATE_FIELD[step]
      if (!field) return
      if (index > target) next[field] = null
      else if (!next[field]) next[field] = today
    })
    next.step = changes.step
    if (changes.step === 'CALLED_3' && changes.status === undefined && next.status === 'PENDING') {
      next.status = 'UNREACHABLE'
    }
  }
  if (changes.status !== undefined && changes.status !== recall.status) {
    next.status = changes.status
    if (changes.status === 'CONFIRMED') next.confirmedAt = today
  }
  if (next.status === 'PENDING' && next.step === 'CALLED_3') return { error: 'PENDING_AT_CALLED_3' }
  return { patch: next }
}

export function canRestart(recall, today) {
  return recall.onHold
    || recall.status === 'UNREACHABLE'
    || (recall.status === 'CONFIRMED' && recall.dueDate < today)
}

export function restartFields(dueDate) {
  return {
    dueDate, step: 'NOT_CONTACTED', status: 'PENDING', lineSentAt: null,
    call1At: null, call2At: null, call3At: null, confirmedAt: null, onHold: false,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/domain/recallRules.js server/tests/unit/recallRules.test.js
git commit -m "feat(server): add recall transition rules (actions, manual edit, restart)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Authentication

**Files:**
- Create: `server/src/services/auth.service.js`, `server/src/validators/auth.validator.js`, `server/src/controllers/auth.controller.js`, `server/src/middleware/auth.middleware.js`, `server/src/routes/auth.routes.js`
- Create: `server/src/scripts/seed.js`, `server/src/scripts/reset-password.js`
- Create: `server/tests/integration/helpers/auth.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/integration/auth.test.js`

**Interfaces:**
- Consumes: `prisma`, `env`, `validate`, `requestSchema`, error classes.
- Produces: `requireAuth` middleware (sets `req.user = { id, username }`); `TOKEN_COOKIE = 'token'`; `authService.{ TOKEN_TTL_SECONDS, hashPassword, login, verifyToken, getCurrentUser, changePassword, ensureUser, resetPassword }`; test helpers `TEST_USER`, `loggedInAgent(app?) → supertest agent`; routes `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PATCH /api/auth/password`.

- [ ] **Step 1: Install dependencies**

```bash
npm install -w server bcryptjs@^3 jsonwebtoken@^9 express-rate-limit@^7
```

- [ ] **Step 2: Write the failing tests**

`server/tests/integration/helpers/auth.js`:
```js
import request from 'supertest'
import { createApp } from '../../../src/app.js'
import { ensureUser } from '../../../src/services/auth.service.js'

export const TEST_USER = { username: 'clinic', password: 'password123' }

export async function loggedInAgent(app = createApp()) {
  await ensureUser(TEST_USER.username, TEST_USER.password)
  const agent = request.agent(app)
  await agent.post('/api/auth/login').send(TEST_USER).expect(200)
  return agent
}
```

`server/tests/integration/auth.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/lib/prisma.js'
import { ensureUser, resetPassword } from '../../src/services/auth.service.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent, TEST_USER } from './helpers/auth.js'

let app
beforeEach(async () => {
  await resetDb()
  await ensureUser(TEST_USER.username, TEST_USER.password)
  app = createApp()
})

describe('POST /api/auth/login', () => {
  it('sets an httpOnly, SameSite=Strict token cookie', async () => {
    const res = await request(app).post('/api/auth/login').send(TEST_USER).expect(200)
    expect(res.body).toEqual({ success: true, data: { user: { id: expect.any(Number), username: 'clinic' } } })
    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toMatch(/^token=/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Strict/)
  })

  it.each([
    ['wrong password', { username: 'clinic', password: 'nope-nope' }],
    ['unknown user', { username: 'ghost', password: 'password123' }],
  ])('rejects %s with the same zh-TW message', async (label, body) => {
    const res = await request(app).post('/api/auth/login').send(body).expect(401)
    expect(res.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' })
  })

  it('validates required fields', async () => {
    const res = await request(app).post('/api/auth/login').send({}).expect(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.map((d) => d.field)).toEqual(['username', 'password'])
  })

  it('rate-limits after 10 failed attempts', async () => {
    for (let i = 0; i < 10; i += 1) {
      await request(app).post('/api/auth/login').send({ username: 'clinic', password: 'wrong-pass' }).expect(401)
    }
    const res = await request(app).post('/api/auth/login').send(TEST_USER).expect(429)
    expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS')
  })

  it('stores only a bcrypt hash', async () => {
    const user = await prisma.user.findUnique({ where: { username: 'clinic' } })
    expect(user.passwordHash).not.toBe(TEST_USER.password)
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/)
  })
})

describe('session', () => {
  it('GET /me requires the cookie', async () => {
    const res = await request(app).get('/api/auth/me').expect(401)
    expect(res.body.error).toEqual({ code: 'UNAUTHORIZED', message: '請先登入' })
  })

  it('GET /me returns the user when logged in', async () => {
    const agent = await loggedInAgent(app)
    const res = await agent.get('/api/auth/me').expect(200)
    expect(res.body.data).toEqual({ id: expect.any(Number), username: 'clinic' })
  })

  it('rejects a tampered token', async () => {
    await request(app).get('/api/auth/me').set('Cookie', 'token=not-a-jwt').expect(401)
  })

  it('logout clears the cookie', async () => {
    const agent = await loggedInAgent(app)
    await agent.post('/api/auth/logout').expect(200)
    await agent.get('/api/auth/me').expect(401)
  })
})

describe('PATCH /api/auth/password', () => {
  it('rejects a wrong current password', async () => {
    const agent = await loggedInAgent(app)
    const res = await agent.patch('/api/auth/password')
      .send({ currentPassword: 'wrong-one', newPassword: 'new-password-1' }).expect(400)
    expect(res.body.error).toEqual({ code: 'WRONG_PASSWORD', message: '目前密碼不正確' })
  })

  it('rejects a short new password', async () => {
    const agent = await loggedInAgent(app)
    const res = await agent.patch('/api/auth/password')
      .send({ currentPassword: TEST_USER.password, newPassword: 'short' }).expect(400)
    expect(res.body.error.message).toBe('新密碼至少 8 個字元')
  })

  it('changes the password', async () => {
    const agent = await loggedInAgent(app)
    await agent.patch('/api/auth/password')
      .send({ currentPassword: TEST_USER.password, newPassword: 'new-password-1' }).expect(200)
    await request(app).post('/api/auth/login').send(TEST_USER).expect(401)
    await request(app).post('/api/auth/login').send({ username: 'clinic', password: 'new-password-1' }).expect(200)
  })
})

describe('resetPassword (admin script)', () => {
  it('overwrites the only user without knowing the old password', async () => {
    await expect(resetPassword('reset-password-1')).resolves.toBe('clinic')
    await request(app).post('/api/auth/login').send({ username: 'clinic', password: 'reset-password-1' }).expect(200)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:integration -w server`
Expected: FAIL — cannot find `src/services/auth.service.js`.

- [ ] **Step 4: Implement**

`server/src/services/auth.service.js`:
```js
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
```

`server/src/validators/auth.validator.js`:
```js
import { z } from 'zod'
import { requestSchema } from './common.js'

export const loginSchema = requestSchema({
  body: z.object({
    username: z.string().trim().min(1, { message: '請輸入帳號' }),
    password: z.string().min(1, { message: '請輸入密碼' }),
  }),
})

export const changePasswordSchema = requestSchema({
  body: z.object({
    currentPassword: z.string().min(1, { message: '請輸入目前密碼' }),
    newPassword: z.string()
      .min(8, { message: '新密碼至少 8 個字元' })
      .max(100, { message: '新密碼最多 100 個字元' }),
  }),
})
```

`server/src/middleware/auth.middleware.js`:
```js
import { verifyToken } from '../services/auth.service.js'
import { UnauthorizedError } from '../errors/AppError.js'

export const TOKEN_COOKIE = 'token'

export function requireAuth(req, res, next) {
  const token = req.cookies?.[TOKEN_COOKIE]
  if (!token) throw new UnauthorizedError('UNAUTHORIZED', '請先登入')
  req.user = verifyToken(token)
  next()
}
```

`server/src/controllers/auth.controller.js`:
```js
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
```

`server/src/routes/auth.routes.js`:
```js
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import * as authController from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { loginSchema, changePasswordSchema } from '../validators/auth.validator.js'
import { TooManyRequestsError } from '../errors/AppError.js'

export function authRoutes() {
  const router = Router()
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new TooManyRequestsError('TOO_MANY_ATTEMPTS', '登入嘗試次數過多，請 15 分鐘後再試')),
  })
  router.post('/login', loginLimiter, validate(loginSchema), authController.login)
  router.post('/logout', authController.logout)
  router.get('/me', requireAuth, authController.me)
  router.patch('/password', requireAuth, validate(changePasswordSchema), authController.changePassword)
  return router
}
```

In `server/src/routes/index.js` add `import { authRoutes } from './auth.routes.js'` and, after the health line, `router.use('/auth', authRoutes())`.

`server/src/scripts/seed.js`:
```js
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
```

`server/src/scripts/reset-password.js`:
```js
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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 6: Seed the dev database**

Run: `npm run db:seed -w server`
Expected: `Created user "clinic"` (or the configured username).

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): add cookie-based JWT auth, rate-limited login and password reset script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Clinic settings

**Files:**
- Create: `server/src/services/setting.service.js`, `server/src/validators/setting.validator.js`, `server/src/controllers/setting.controller.js`, `server/src/routes/setting.routes.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/integration/settings.test.js`

**Interfaces:**
- Consumes: `prisma`, `requireAuth`, `validate`, `loggedInAgent`, `resetDb`.
- Produces: `settingService.getSettings(db = prisma) → { recallIntervalMonths, lineLeadDays, callAfterLineDays, callGapDays }` (creates the row on first read; accepts a transaction client), `settingService.updateSettings(changes)`; routes `GET /api/settings`, `PATCH /api/settings`.

- [ ] **Step 1: Write the failing tests**

`server/tests/integration/settings.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'

let agent
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
})

describe('settings', () => {
  it('returns defaults on first read', async () => {
    const res = await agent.get('/api/settings').expect(200)
    expect(res.body.data).toEqual({ recallIntervalMonths: 6, lineLeadDays: 7, callAfterLineDays: 3, callGapDays: 2 })
  })

  it('updates only the fields sent', async () => {
    const res = await agent.patch('/api/settings').send({ recallIntervalMonths: 3 }).expect(200)
    expect(res.body.data).toEqual({ recallIntervalMonths: 3, lineLeadDays: 7, callAfterLineDays: 3, callGapDays: 2 })
  })

  it('rejects values out of range with a zh-TW field message', async () => {
    const res = await agent.patch('/api/settings').send({ callGapDays: 0 }).expect(400)
    expect(res.body.error.details).toEqual([{ field: 'callGapDays', message: '電話間隔天數需介於 1–14' }])
  })

  it('rejects an empty update and unknown keys', async () => {
    await agent.patch('/api/settings').send({}).expect(400)
    await agent.patch('/api/settings').send({ foo: 1 }).expect(400)
  })

  it('requires login', async () => {
    await request(createApp()).get('/api/settings').expect(401)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:integration -w server`
Expected: FAIL — `/api/settings` returns 404.

- [ ] **Step 3: Implement**

`server/src/services/setting.service.js`:
```js
import { prisma } from '../lib/prisma.js'

const SELECT = { recallIntervalMonths: true, lineLeadDays: true, callAfterLineDays: true, callGapDays: true }

// The clinic has a single settings row (id 1); it is created with defaults on first read.
export function getSettings(db = prisma) {
  return db.clinicSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 }, select: SELECT })
}

export async function updateSettings(changes) {
  await getSettings()
  return prisma.clinicSetting.update({ where: { id: 1 }, data: changes, select: SELECT })
}
```

`server/src/validators/setting.validator.js`:
```js
import { z } from 'zod'
import { requestSchema } from './common.js'

function rangedInt(label, min, max) {
  const message = `${label}需介於 ${min}–${max}`
  return z.number({ invalid_type_error: `${label}必須是數字` })
    .int({ message: `${label}必須是整數` })
    .min(min, { message })
    .max(max, { message })
}

export const updateSettingsSchema = requestSchema({
  body: z.object({
    recallIntervalMonths: rangedInt('回診間隔月數', 1, 24).optional(),
    lineLeadDays: rangedInt('提前傳 LINE 天數', 1, 30).optional(),
    callAfterLineDays: rangedInt('傳 LINE 後打電話天數', 1, 14).optional(),
    callGapDays: rangedInt('電話間隔天數', 1, 14).optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, { message: '沒有要修改的設定' }),
})
```

`server/src/controllers/setting.controller.js`:
```js
import * as settingService from '../services/setting.service.js'

export async function getSettings(req, res) {
  res.json({ success: true, data: await settingService.getSettings() })
}

export async function updateSettings(req, res) {
  res.json({ success: true, data: await settingService.updateSettings(req.valid.body) })
}
```

`server/src/routes/setting.routes.js`:
```js
import { Router } from 'express'
import * as settingController from '../controllers/setting.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { updateSettingsSchema } from '../validators/setting.validator.js'

export function settingRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.get('/', settingController.getSettings)
  router.patch('/', validate(updateSettingsSchema), settingController.updateSettings)
  return router
}
```

In `server/src/routes/index.js` add `import { settingRoutes } from './setting.routes.js'` and `router.use('/settings', settingRoutes())`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add clinic settings endpoints" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Patients

**Files:**
- Create: `server/src/domain/patientRules.js`, `server/src/mappers/patient.mapper.js`, `server/src/mappers/recall.mapper.js`
- Create: `server/src/validators/patient.validator.js`, `server/src/services/patient.service.js`, `server/src/controllers/patient.controller.js`, `server/src/routes/patient.routes.js`
- Create: `server/tests/integration/helpers/factories.js`
- Modify: `server/src/validators/common.js`, `server/src/routes/index.js`
- Test: `server/tests/integration/patients.test.js`

**Interfaces:**
- Consumes: `withNextAction` (Task 3), `getSettings` (Task 6), date helpers, `loggedInAgent`, `resetDb`.
- Produces:
  - `PHONE_PATTERN = /^0\d{8,9}$/`, `NAME_MAX_LENGTH = 50`, `COMMENT_MAX_LENGTH = 2000`, `normalizePhoneText(str) → str` (strips spaces, dashes, parentheses)
  - common validators `personName`, `phoneNumber`, `commentText`
  - `patientFromDb(row)`, `visitFromDb(row)`; `recallFromDb(row)`, `recallFieldsToDb(fields)`, `eventFromDb(row)`
  - `patientService.{ PAGE_SIZE, listPatients({ search, status, page }), getPatient(id), createPatient(input), updatePatient(id, changes), deletePatient(id), toPatientWithRecall(row, settings, today) }`
  - API shapes: **PatientDTO** `{ id, name, phoneNumber, birthDate, hasLine, comment, createdAt, updatedAt }`; **RecallDTO** `{ id, patientId, visitId, dueDate, step, status, lineSentAt, call1At, call2At, call3At, confirmedAt, onHold, version, createdAt, updatedAt, nextAction }`; list → `{ items: [PatientDTO & { currentRecall: RecallDTO|null }], page, pageSize, total }`; detail → `PatientDTO & { currentRecall, visits: [{ id, patientId, visitDate, note, createdAt }], events: [{ id, recallId, type, action, note, before, after, createdAt }] }`
  - factories `createPatient(overrides) → Prisma row`, `createVisitWithRecall(patientId, { visitDate?, ...recallFields }) → { visit, recall }` (Prisma rows)

- [ ] **Step 1: Write the failing tests**

`server/tests/integration/helpers/factories.js`:
```js
import { prisma } from '../../../src/lib/prisma.js'
import { addMonths, todayInClinic, toDbDate } from '../../../src/lib/dates.js'
import { recallFieldsToDb } from '../../../src/mappers/recall.mapper.js'

let sequence = 0

export async function createPatient({ birthDate = '1990-01-01', ...overrides } = {}) {
  sequence += 1
  return prisma.patient.create({
    data: { name: `測試客人${sequence}`, phoneNumber: '0912345678', hasLine: true, ...overrides, birthDate: toDbDate(birthDate) },
  })
}

// Creates a visit and the recall it started. Recall fields use 'YYYY-MM-DD' strings.
export async function createVisitWithRecall(patientId, { visitDate = todayInClinic(), ...recall } = {}) {
  const visit = await prisma.visit.create({ data: { patientId, visitDate: toDbDate(visitDate) } })
  const row = await prisma.recall.create({
    data: { patientId, visitId: visit.id, ...recallFieldsToDb({ dueDate: addMonths(visitDate, 6), ...recall }) },
  })
  return { visit, recall: row }
}
```

`server/tests/integration/patients.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { prisma } from '../../src/lib/prisma.js'
import { addDays, todayInClinic } from '../../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'
import { createPatient, createVisitWithRecall } from './helpers/factories.js'

const NEW_PATIENT = { name: '王小明', phoneNumber: '0912-345-678', birthDate: '1990-01-01', hasLine: true, comment: '怕痛' }

let agent
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
})

describe('POST /api/patients', () => {
  it('creates a patient, normalising phone and keeping the birth date exact', async () => {
    const res = await agent.post('/api/patients').send(NEW_PATIENT).expect(201)
    expect(res.body.data).toMatchObject({
      name: '王小明', phoneNumber: '0912345678', birthDate: '1990-01-01', hasLine: true, comment: '怕痛',
      currentRecall: null, visits: [], events: [],
    })
  })

  it('trims half- and full-width spaces from the name', async () => {
    const res = await agent.post('/api/patients').send({ ...NEW_PATIENT, name: ' 王小明　' }).expect(201)
    expect(res.body.data.name).toBe('王小明')
  })

  it('rejects a duplicate name + birth date, even with stray spaces', async () => {
    const first = await agent.post('/api/patients').send(NEW_PATIENT).expect(201)
    const res = await agent.post('/api/patients').send({ ...NEW_PATIENT, name: '王小明　' }).expect(409)
    expect(res.body.error).toEqual({
      code: 'PATIENT_DUPLICATE', message: '已有相同姓名與生日的客人', details: { existingPatientId: first.body.data.id },
    })
  })

  it('validates fields with zh-TW messages', async () => {
    const tomorrow = addDays(todayInClinic(), 1)
    const res = await agent.post('/api/patients')
      .send({ ...NEW_PATIENT, phoneNumber: '12345', birthDate: tomorrow }).expect(400)
    expect(res.body.error.details).toEqual(expect.arrayContaining([
      { field: 'phoneNumber', message: '電話格式錯誤，應為 0 開頭的 9–10 位數字' },
      { field: 'birthDate', message: '日期不可晚於今天' },
    ]))
  })

  it('requires login', async () => {
    await request(createApp()).post('/api/patients').send(NEW_PATIENT).expect(401)
  })
})

describe('GET /api/patients', () => {
  beforeEach(async () => {
    const a = await createPatient({ name: '王小明', phoneNumber: '0912345678', birthDate: '1990-01-01' })
    await createPatient({ name: '陳美玲', phoneNumber: '0933111222', birthDate: '1985-05-05' })
    await createPatient({ name: '林大華', phoneNumber: '0221234567', birthDate: '1970-12-31' })
    await createVisitWithRecall(a.id, { status: 'CONFIRMED' })
  })

  const names = (res) => res.body.data.items.map((p) => p.name)

  it('lists all patients by name with paging info', async () => {
    const res = await agent.get('/api/patients').expect(200)
    expect(res.body.data).toMatchObject({ page: 1, pageSize: 50, total: 3 })
    expect(names(res)).toHaveLength(3)
  })

  it('searches by part of the name', async () => {
    expect(names(await agent.get('/api/patients?search=美玲'))).toEqual(['陳美玲'])
  })

  it('searches by phone digits even when typed with dashes', async () => {
    expect(names(await agent.get('/api/patients?search=0933-111'))).toEqual(['陳美玲'])
  })

  it('searches by exact birth date in either separator style', async () => {
    expect(names(await agent.get('/api/patients?search=1970/12/31'))).toEqual(['林大華'])
  })

  it('filters by current recall status and includes the recall', async () => {
    const res = await agent.get('/api/patients?status=CONFIRMED').expect(200)
    expect(names(res)).toEqual(['王小明'])
    expect(res.body.data.items[0].currentRecall).toMatchObject({ status: 'CONFIRMED', nextAction: null })
  })
})

describe('GET/PATCH/DELETE /api/patients/:id', () => {
  it('returns 404 for a missing patient', async () => {
    const res = await agent.get('/api/patients/999999').expect(404)
    expect(res.body.error).toEqual({ code: 'PATIENT_NOT_FOUND', message: '找不到這位客人' })
  })

  it('returns detail with current recall, visits and events', async () => {
    const p = await createPatient()
    await createVisitWithRecall(p.id, { dueDate: addDays(todayInClinic(), 7) })
    const res = await agent.get(`/api/patients/${p.id}`).expect(200)
    expect(res.body.data.currentRecall).toMatchObject({ step: 'NOT_CONTACTED', status: 'PENDING', version: 0 })
    expect(res.body.data.currentRecall.nextAction).toEqual({ action: 'SEND_LINE', actionDate: todayInClinic(), overdueDays: 0 })
    expect(res.body.data.visits).toHaveLength(1)
    expect(res.body.data.events).toEqual([])
  })

  it('updates fields', async () => {
    const p = await createPatient()
    const res = await agent.patch(`/api/patients/${p.id}`).send({ phoneNumber: '0987 654 321', hasLine: false }).expect(200)
    expect(res.body.data).toMatchObject({ phoneNumber: '0987654321', hasLine: false })
  })

  it('refuses an update that collides with another patient', async () => {
    await createPatient({ name: '甲', birthDate: '1990-01-01' })
    const b = await createPatient({ name: '乙', birthDate: '1990-01-01' })
    const res = await agent.patch(`/api/patients/${b.id}`).send({ name: '甲' }).expect(409)
    expect(res.body.error.code).toBe('PATIENT_DUPLICATE')
  })

  it('rejects an empty update', async () => {
    const p = await createPatient()
    await agent.patch(`/api/patients/${p.id}`).send({}).expect(400)
  })

  it('deletes a patient with their visits and recalls', async () => {
    const p = await createPatient()
    await createVisitWithRecall(p.id)
    await agent.delete(`/api/patients/${p.id}`).expect(200)
    expect(await prisma.visit.count()).toBe(0)
    expect(await prisma.recall.count()).toBe(0)
    await agent.get(`/api/patients/${p.id}`).expect(404)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:integration -w server`
Expected: FAIL — cannot find `src/mappers/recall.mapper.js` (imported by the factories).

- [ ] **Step 3: Implement**

`server/src/domain/patientRules.js`:
```js
export const PHONE_PATTERN = /^0\d{8,9}$/
export const NAME_MAX_LENGTH = 50
export const COMMENT_MAX_LENGTH = 2000

export function normalizePhoneText(text) {
  return text.replace(/[\s\-()]/g, '')
}
```

Append to `server/src/validators/common.js` (and add `import { PHONE_PATTERN, NAME_MAX_LENGTH, COMMENT_MAX_LENGTH, normalizePhoneText } from '../domain/patientRules.js'` at the top):
```js
export const personName = z.string().trim()
  .min(1, { message: '請輸入姓名' })
  .max(NAME_MAX_LENGTH, { message: `姓名最多 ${NAME_MAX_LENGTH} 字` })

export const phoneNumber = z.string()
  .transform(normalizePhoneText)
  .pipe(z.string().regex(PHONE_PATTERN, { message: '電話格式錯誤，應為 0 開頭的 9–10 位數字' }))

export const commentText = z.string().trim()
  .max(COMMENT_MAX_LENGTH, { message: `備註最多 ${COMMENT_MAX_LENGTH} 字` })
  .nullable()
  .transform((text) => text || null)
```

`server/src/mappers/recall.mapper.js`:
```js
import { fromDbDate, toDbDate } from '../lib/dates.js'

const DATE_FIELDS = ['dueDate', 'lineSentAt', 'call1At', 'call2At', 'call3At', 'confirmedAt']

export function recallFromDb(row) {
  const recall = {
    id: row.id,
    patientId: row.patientId,
    visitId: row.visitId,
    step: row.step,
    status: row.status,
    onHold: row.onHold,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
  for (const field of DATE_FIELDS) recall[field] = fromDbDate(row[field])
  return recall
}

// Converts any date-string fields present in `fields` to Prisma Date values.
export function recallFieldsToDb(fields) {
  const data = { ...fields }
  for (const field of DATE_FIELDS) {
    if (field in data) data[field] = toDbDate(data[field])
  }
  return data
}

export function eventFromDb(row) {
  return {
    id: row.id,
    recallId: row.recallId,
    type: row.type,
    action: row.action,
    note: row.note,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt.toISOString(),
  }
}
```

`server/src/mappers/patient.mapper.js`:
```js
import { fromDbDate, toDbDate } from '../lib/dates.js'

export function patientFromDb(row) {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phoneNumber,
    birthDate: fromDbDate(row.birthDate),
    hasLine: row.hasLine,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function patientFieldsToDb(fields) {
  return 'birthDate' in fields ? { ...fields, birthDate: toDbDate(fields.birthDate) } : { ...fields }
}

export function visitFromDb(row) {
  return {
    id: row.id,
    patientId: row.patientId,
    visitDate: fromDbDate(row.visitDate),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }
}
```

`server/src/validators/patient.validator.js`:
```js
import { z } from 'zod'
import { requestSchema, idParams, personName, phoneNumber, pastOrTodayDate, commentText } from './common.js'

export const listPatientsSchema = requestSchema({
  query: z.object({
    search: z.string().trim().max(50).optional().transform((text) => text || undefined),
    status: z.enum(['PENDING', 'CONFIRMED', 'UNREACHABLE']).optional(),
    page: z.coerce.number().int().min(1).default(1),
  }),
})

export const patientIdSchema = requestSchema({ params: idParams })

export const createPatientSchema = requestSchema({
  body: z.object({
    name: personName,
    phoneNumber,
    birthDate: pastOrTodayDate,
    hasLine: z.boolean().default(true),
    comment: commentText.optional(),
  }).strict(),
})

export const updatePatientSchema = requestSchema({
  params: idParams,
  body: z.object({
    name: personName.optional(),
    phoneNumber: phoneNumber.optional(),
    birthDate: pastOrTodayDate.optional(),
    hasLine: z.boolean().optional(),
    comment: commentText.optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, { message: '沒有要修改的欄位' }),
})
```

`server/src/services/patient.service.js`:
```js
import { prisma } from '../lib/prisma.js'
import { isValidDateString, todayInClinic, toDbDate } from '../lib/dates.js'
import { ConflictError, NotFoundError } from '../errors/AppError.js'
import { patientFromDb, patientFieldsToDb, visitFromDb } from '../mappers/patient.mapper.js'
import { recallFromDb, eventFromDb } from '../mappers/recall.mapper.js'
import { withNextAction } from '../domain/recallRules.js'
import { getSettings } from './setting.service.js'

export const PAGE_SIZE = 50
const CURRENT_RECALL = { where: { status: { not: 'COMPLETED' } }, take: 1 }

export function toPatientWithRecall(row, settings, today) {
  const recallRow = row.recalls?.[0]
  return {
    ...patientFromDb(row),
    currentRecall: recallRow ? withNextAction(recallFromDb(recallRow), row.hasLine, settings, today) : null,
  }
}

function buildWhere(search, status) {
  const conditions = []
  if (search) {
    const or = [{ name: { contains: search } }]
    const digits = search.replace(/\D/g, '')
    if (digits.length >= 3) or.push({ phoneNumber: { contains: digits } })
    const date = search.replaceAll('/', '-')
    if (isValidDateString(date)) or.push({ birthDate: toDbDate(date) })
    conditions.push({ OR: or })
  }
  if (status) conditions.push({ recalls: { some: { status } } })
  return conditions.length ? { AND: conditions } : {}
}

export async function listPatients({ search, status, page }) {
  const today = todayInClinic()
  const where = buildWhere(search, status)
  const [rows, total, settings] = await Promise.all([
    prisma.patient.findMany({
      where,
      include: { recalls: CURRENT_RECALL },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.patient.count({ where }),
    getSettings(),
  ])
  return { items: rows.map((row) => toPatientWithRecall(row, settings, today)), page, pageSize: PAGE_SIZE, total }
}

export async function getPatient(id) {
  const today = todayInClinic()
  const row = await prisma.patient.findUnique({
    where: { id },
    include: { recalls: CURRENT_RECALL, visits: { orderBy: { visitDate: 'desc' } } },
  })
  if (!row) throw new NotFoundError('PATIENT_NOT_FOUND', '找不到這位客人')
  const [events, settings] = await Promise.all([
    prisma.recallEvent.findMany({ where: { recall: { patientId: id } }, orderBy: { id: 'desc' }, take: 100 }),
    getSettings(),
  ])
  return {
    ...toPatientWithRecall(row, settings, today),
    visits: row.visits.map(visitFromDb),
    events: events.map(eventFromDb),
  }
}

async function assertNoDuplicate(db, name, birthDate, excludeId) {
  const existing = await db.patient.findUnique({
    where: { name_birthDate: { name, birthDate: toDbDate(birthDate) } },
  })
  if (existing && existing.id !== excludeId) {
    throw new ConflictError('PATIENT_DUPLICATE', '已有相同姓名與生日的客人', { existingPatientId: existing.id })
  }
}

export async function createPatient(input) {
  const id = await prisma.$transaction(async (tx) => {
    await assertNoDuplicate(tx, input.name, input.birthDate)
    const row = await tx.patient.create({ data: patientFieldsToDb(input) })
    return row.id
  })
  return getPatient(id)
}

export async function updatePatient(id, changes) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.patient.findUnique({ where: { id } })
    if (!current) throw new NotFoundError('PATIENT_NOT_FOUND', '找不到這位客人')
    if (changes.name !== undefined || changes.birthDate !== undefined) {
      const name = changes.name ?? current.name
      const birthDate = changes.birthDate ?? current.birthDate.toISOString().slice(0, 10)
      await assertNoDuplicate(tx, name, birthDate, id)
    }
    await tx.patient.update({ where: { id }, data: patientFieldsToDb(changes) })
  })
  return getPatient(id)
}

export async function deletePatient(id) {
  const existing = await prisma.patient.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new NotFoundError('PATIENT_NOT_FOUND', '找不到這位客人')
  await prisma.patient.delete({ where: { id } })
}
```

`server/src/controllers/patient.controller.js`:
```js
import * as patientService from '../services/patient.service.js'

export async function listPatients(req, res) {
  res.json({ success: true, data: await patientService.listPatients(req.valid.query) })
}

export async function getPatient(req, res) {
  res.json({ success: true, data: await patientService.getPatient(req.valid.params.id) })
}

export async function createPatient(req, res) {
  res.status(201).json({ success: true, data: await patientService.createPatient(req.valid.body) })
}

export async function updatePatient(req, res) {
  res.json({ success: true, data: await patientService.updatePatient(req.valid.params.id, req.valid.body) })
}

export async function deletePatient(req, res) {
  await patientService.deletePatient(req.valid.params.id)
  res.json({ success: true, data: null })
}
```

`server/src/routes/patient.routes.js`:
```js
import { Router } from 'express'
import * as patientController from '../controllers/patient.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import {
  listPatientsSchema, patientIdSchema, createPatientSchema, updatePatientSchema,
} from '../validators/patient.validator.js'

export function patientRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.get('/', validate(listPatientsSchema), patientController.listPatients)
  router.post('/', validate(createPatientSchema), patientController.createPatient)
  router.get('/:id', validate(patientIdSchema), patientController.getPatient)
  router.patch('/:id', validate(updatePatientSchema), patientController.updatePatient)
  router.delete('/:id', validate(patientIdSchema), patientController.deletePatient)
  return router
}
```

In `server/src/routes/index.js` add `import { patientRoutes } from './patient.routes.js'` and `router.use('/patients', patientRoutes())`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add patient CRUD with search, duplicate detection and current recall" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Visits

**Files:**
- Create: `server/src/validators/visit.validator.js`, `server/src/services/visit.service.js`, `server/src/controllers/visit.controller.js`, `server/src/routes/visit.routes.js`
- Modify: `server/src/routes/patient.routes.js`, `server/src/routes/index.js`, `server/src/validators/patient.validator.js`, `server/src/services/patient.service.js`
- Test: `server/tests/integration/visits.test.js`

**Interfaces:**
- Consumes: `snapshot` (Task 4), mappers (Task 7), `getSettings(tx)`, `addMonths`.
- Produces: `visitService.recordVisit(patientId, { visitDate?, note? }) → { visit, recall }`, `visitService.recordVisitInTx(tx, patientId, { visitDate, note }, today)`, `visitService.deleteVisit(visitId) → { patientId }`; routes `POST /api/patients/:id/visits` (201), `DELETE /api/visits/:id`; `POST /api/patients` accepts `registerVisitToday: boolean` (default false).

- [ ] **Step 1: Write the failing tests**

`server/tests/integration/visits.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../src/lib/prisma.js'
import { addDays, addMonths, fromDbDate, todayInClinic } from '../../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'
import { createPatient, createVisitWithRecall } from './helpers/factories.js'

let agent
let today
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
  today = todayInClinic()
})

describe('POST /api/patients/:id/visits', () => {
  it('records today by default and opens a recall due in 6 months', async () => {
    const p = await createPatient()
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({}).expect(201)
    expect(res.body.data.visit).toMatchObject({ patientId: p.id, visitDate: today })
    expect(res.body.data.recall).toMatchObject({ dueDate: addMonths(today, 6), step: 'NOT_CONTACTED', status: 'PENDING' })
  })

  it('uses the configured recall interval', async () => {
    await agent.patch('/api/settings').send({ recallIntervalMonths: 3 }).expect(200)
    const p = await createPatient()
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({}).expect(201)
    expect(res.body.data.recall.dueDate).toBe(addMonths(today, 3))
  })

  it('accepts a back-dated visit', async () => {
    const p = await createPatient()
    const visitDate = addDays(today, -3)
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({ visitDate }).expect(201)
    expect(res.body.data.recall.dueDate).toBe(addMonths(visitDate, 6))
  })

  it('completes the current recall, whatever its status, and logs the change', async () => {
    const p = await createPatient()
    const { recall: old } = await createVisitWithRecall(p.id, {
      visitDate: addDays(today, -200), dueDate: addDays(today, -17), status: 'UNREACHABLE', step: 'CALLED_3',
    })
    await agent.post(`/api/patients/${p.id}/visits`).send({}).expect(201)
    const closed = await prisma.recall.findUnique({ where: { id: old.id } })
    expect(closed.status).toBe('COMPLETED')
    const event = await prisma.recallEvent.findFirst({ where: { recallId: old.id } })
    expect(event).toMatchObject({ type: 'VISIT_RECORDED', before: expect.objectContaining({ status: 'UNREACHABLE' }) })
    expect(await prisma.recall.count({ where: { patientId: p.id, status: { not: 'COMPLETED' } } })).toBe(1)
  })

  it.each([
    ['the same date twice', 0, 409, 'VISIT_DATE_TAKEN'],
    ['a date before the latest visit', -1, 400, 'VISIT_BEFORE_LATEST'],
  ])('rejects %s', async (label, offset, status, code) => {
    const p = await createPatient()
    await createVisitWithRecall(p.id, { visitDate: today })
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({ visitDate: addDays(today, offset) }).expect(status)
    expect(res.body.error.code).toBe(code)
  })

  it('rejects a future visit date', async () => {
    const p = await createPatient()
    const res = await agent.post(`/api/patients/${p.id}/visits`).send({ visitDate: addDays(today, 1) }).expect(400)
    expect(res.body.error).toMatchObject({ code: 'VISIT_DATE_IN_FUTURE', message: '看診日不可晚於今天' })
  })

  it('returns 404 for a missing patient', async () => {
    await agent.post('/api/patients/999999/visits').send({}).expect(404)
  })
})

describe('DELETE /api/visits/:id', () => {
  it('removes the latest visit and restores the previous recall', async () => {
    const p = await createPatient()
    const { recall: old } = await createVisitWithRecall(p.id, {
      visitDate: addDays(today, -190), dueDate: addDays(today, -7), status: 'CONFIRMED', confirmedAt: addDays(today, -10),
    })
    const created = await agent.post(`/api/patients/${p.id}/visits`).send({}).expect(201)

    await agent.delete(`/api/visits/${created.body.data.visit.id}`).expect(200)

    const restored = await prisma.recall.findUnique({ where: { id: old.id } })
    expect(restored.status).toBe('CONFIRMED')
    expect(fromDbDate(restored.confirmedAt)).toBe(addDays(today, -10))
    expect(await prisma.recall.count({ where: { patientId: p.id } })).toBe(1)
    const lastEvent = await prisma.recallEvent.findFirst({ where: { recallId: old.id }, orderBy: { id: 'desc' } })
    expect(lastEvent).toMatchObject({ type: 'UNDO', note: '撤銷看診' })
  })

  it('refuses to delete a visit that is not the latest', async () => {
    const p = await createPatient()
    const { visit: older } = await createVisitWithRecall(p.id, { visitDate: addDays(today, -190), status: 'COMPLETED' })
    await createVisitWithRecall(p.id, { visitDate: today })
    const res = await agent.delete(`/api/visits/${older.id}`).expect(409)
    expect(res.body.error).toEqual({ code: 'VISIT_NOT_LATEST', message: '只能刪除最新一筆看診紀錄' })
  })

  it('leaves no current recall when the only visit is deleted', async () => {
    const p = await createPatient()
    const { visit } = await createVisitWithRecall(p.id)
    await agent.delete(`/api/visits/${visit.id}`).expect(200)
    const detail = await agent.get(`/api/patients/${p.id}`).expect(200)
    expect(detail.body.data).toMatchObject({ currentRecall: null, visits: [] })
  })
})

describe('POST /api/patients with registerVisitToday', () => {
  it('creates the patient and their first recall in one step', async () => {
    const res = await agent.post('/api/patients').send({
      name: '新客人', phoneNumber: '0912000111', birthDate: '2000-02-02', registerVisitToday: true,
    }).expect(201)
    expect(res.body.data.visits).toHaveLength(1)
    expect(res.body.data.currentRecall).toMatchObject({ dueDate: addMonths(today, 6), status: 'PENDING' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:integration -w server`
Expected: FAIL — visit routes return 404 and `registerVisitToday` is rejected as an unknown key.

- [ ] **Step 3: Implement**

`server/src/validators/visit.validator.js`:
```js
import { z } from 'zod'
import { requestSchema, idParams, dateString } from './common.js'

export const recordVisitSchema = requestSchema({
  params: idParams,
  body: z.object({
    visitDate: dateString.optional(),
    note: z.string().trim().max(500, { message: '備註最多 500 字' }).transform((text) => text || null).optional(),
  }).strict(),
})

export const visitIdSchema = requestSchema({ params: idParams })
```

`server/src/services/visit.service.js`:
```js
import { prisma } from '../lib/prisma.js'
import { addMonths, fromDbDate, todayInClinic, toDbDate } from '../lib/dates.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js'
import { visitFromDb } from '../mappers/patient.mapper.js'
import { recallFromDb, recallFieldsToDb } from '../mappers/recall.mapper.js'
import { snapshot } from '../domain/recallRules.js'
import { getSettings } from './setting.service.js'

// Serialises concurrent visit changes for one patient.
async function lockPatient(tx, patientId) {
  const rows = await tx.$queryRaw`SELECT id FROM Patient WHERE id = ${patientId} FOR UPDATE`
  if (rows.length === 0) throw new NotFoundError('PATIENT_NOT_FOUND', '找不到這位客人')
}

export async function recordVisitInTx(tx, patientId, { visitDate, note }, today) {
  if (visitDate > today) throw new ValidationError('VISIT_DATE_IN_FUTURE', '看診日不可晚於今天')
  const latest = await tx.visit.findFirst({ where: { patientId }, orderBy: { visitDate: 'desc' } })
  if (latest) {
    const latestDate = fromDbDate(latest.visitDate)
    if (visitDate === latestDate) throw new ConflictError('VISIT_DATE_TAKEN', '該日期已登記過看診')
    if (visitDate < latestDate) {
      throw new ValidationError('VISIT_BEFORE_LATEST', `看診日不可早於上次看診日 ${latestDate}`)
    }
  }

  const visit = await tx.visit.create({ data: { patientId, visitDate: toDbDate(visitDate), note } })

  const current = await tx.recall.findFirst({ where: { patientId, status: { not: 'COMPLETED' } } })
  if (current) {
    const before = snapshot(recallFromDb(current))
    await tx.recall.update({ where: { id: current.id }, data: { status: 'COMPLETED', version: { increment: 1 } } })
    await tx.recallEvent.create({
      data: { recallId: current.id, type: 'VISIT_RECORDED', before, after: { ...before, status: 'COMPLETED' } },
    })
  }

  const settings = await getSettings(tx)
  const recall = await tx.recall.create({
    data: { patientId, visitId: visit.id, dueDate: toDbDate(addMonths(visitDate, settings.recallIntervalMonths)) },
  })
  return { visit: visitFromDb(visit), recall: recallFromDb(recall) }
}

export async function recordVisit(patientId, { visitDate, note }) {
  const today = todayInClinic()
  return prisma.$transaction(async (tx) => {
    await lockPatient(tx, patientId)
    return recordVisitInTx(tx, patientId, { visitDate: visitDate ?? today, note: note ?? null }, today)
  })
}

export async function deleteVisit(visitId) {
  return prisma.$transaction(async (tx) => {
    const visit = await tx.visit.findUnique({ where: { id: visitId } })
    if (!visit) throw new NotFoundError('VISIT_NOT_FOUND', '找不到這筆看診紀錄')
    await lockPatient(tx, visit.patientId)

    const latest = await tx.visit.findFirst({ where: { patientId: visit.patientId }, orderBy: { visitDate: 'desc' } })
    if (latest.id !== visit.id) throw new ConflictError('VISIT_NOT_LATEST', '只能刪除最新一筆看診紀錄')

    // Cascades to the recall this visit started and that recall's events.
    await tx.visit.delete({ where: { id: visit.id } })

    const previous = await tx.visit.findFirst({
      where: { patientId: visit.patientId },
      orderBy: { visitDate: 'desc' },
      include: { recall: true },
    })
    const previousRecall = previous?.recall
    if (previousRecall?.status === 'COMPLETED') {
      const closedBy = await tx.recallEvent.findFirst({
        where: { recallId: previousRecall.id, type: 'VISIT_RECORDED' },
        orderBy: { id: 'desc' },
      })
      if (closedBy) {
        const before = snapshot(recallFromDb(previousRecall))
        await tx.recall.update({
          where: { id: previousRecall.id },
          data: { ...recallFieldsToDb(closedBy.before), version: { increment: 1 } },
        })
        await tx.recallEvent.create({
          data: { recallId: previousRecall.id, type: 'UNDO', note: '撤銷看診', before, after: closedBy.before },
        })
      }
    }
    return { patientId: visit.patientId }
  })
}
```

`server/src/controllers/visit.controller.js`:
```js
import * as visitService from '../services/visit.service.js'

export async function recordVisit(req, res) {
  const data = await visitService.recordVisit(req.valid.params.id, req.valid.body)
  res.status(201).json({ success: true, data })
}

export async function deleteVisit(req, res) {
  res.json({ success: true, data: await visitService.deleteVisit(req.valid.params.id) })
}
```

`server/src/routes/visit.routes.js`:
```js
import { Router } from 'express'
import * as visitController from '../controllers/visit.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { visitIdSchema } from '../validators/visit.validator.js'

export function visitRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.delete('/:id', validate(visitIdSchema), visitController.deleteVisit)
  return router
}
```

In `server/src/routes/patient.routes.js` add the imports `import * as visitController from '../controllers/visit.controller.js'` and `import { recordVisitSchema } from '../validators/visit.validator.js'`, and the route (before `return router`):
```js
  router.post('/:id/visits', validate(recordVisitSchema), visitController.recordVisit)
```

In `server/src/routes/index.js` add `import { visitRoutes } from './visit.routes.js'` and `router.use('/visits', visitRoutes())`.

In `server/src/validators/patient.validator.js`, add to the `createPatientSchema` body object:
```js
    registerVisitToday: z.boolean().default(false),
```

In `server/src/services/patient.service.js` add `import { recordVisitInTx } from './visit.service.js'` and replace `createPatient` with:
```js
export async function createPatient({ registerVisitToday, ...input }) {
  const today = todayInClinic()
  const id = await prisma.$transaction(async (tx) => {
    await assertNoDuplicate(tx, input.name, input.birthDate)
    const row = await tx.patient.create({ data: patientFieldsToDb(input) })
    if (registerVisitToday) await recordVisitInTx(tx, row.id, { visitDate: today, note: null }, today)
    return row.id
  })
  return getPatient(id)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): record and undo visits with transactional recall hand-over" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Recalls — today list, secondary lists, actions, undo, edit, restart

**Files:**
- Create: `server/src/validators/recall.validator.js`, `server/src/services/recall.service.js`, `server/src/controllers/recall.controller.js`, `server/src/routes/recall.routes.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/integration/recalls.test.js`

**Interfaces:**
- Consumes: `buildTodayItems`, `withNextAction`, `applyAction`, `applyManualEdit`, `canRestart`, `restartFields`, `snapshot`, `STEPS` (Tasks 3–4); mappers; `getSettings`.
- Produces:
  - `RecallItem` = `RecallDTO & { patient: { id, name, phoneNumber, hasLine } }`
  - `GET /api/recalls/today` → `{ today, summary: { total, overdue }, counts: { 'confirmed-no-show', 'import-overdue', unreachable }, items: RecallItem[] }`
  - `GET /api/recalls?list=confirmed-no-show|import-overdue|unreachable` → `{ items: RecallItem[] }`
  - `POST /api/recalls/:id/actions` `{ action, version }` → `{ recall: RecallItem, eventId }`
  - `POST /api/recalls/:id/undo` `{ eventId, version }` → `{ recall, eventId }`
  - `PATCH /api/recalls/:id` `{ step?, status?, dueDate?, note?, version }` → `{ recall, eventId }`
  - `POST /api/recalls/:id/restart` `{ dueDate, version }` → `{ recall, eventId }`
  - Error codes: `RECALL_NOT_FOUND` 404, `RECALL_STALE` 409, `ACTION_NOT_ALLOWED` 409, `UNDO_NOT_ALLOWED` 409, `RECALL_COMPLETED` 409, `PENDING_AT_CALLED_3` 400, `RESTART_NOT_ALLOWED` 409, `DUE_DATE_IN_PAST` 400.

- [ ] **Step 1: Write the failing tests**

`server/tests/integration/recalls.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../src/lib/prisma.js'
import { addDays, todayInClinic } from '../../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'
import { createPatient, createVisitWithRecall } from './helpers/factories.js'

let agent
let today
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
  today = todayInClinic()
})

async function patientWithRecall(recall = {}, patient = {}) {
  const p = await createPatient(patient)
  const { recall: row } = await createVisitWithRecall(p.id, recall)
  return row
}

describe('GET /api/recalls/today', () => {
  it('lists due recalls sorted by urgency with a summary and list counts', async () => {
    await patientWithRecall({ dueDate: addDays(today, 7) }, { name: '甲' })
    await patientWithRecall({
      dueDate: addDays(today, 3), step: 'CALLED_2',
      lineSentAt: addDays(today, -7), call1At: addDays(today, -4), call2At: addDays(today, -2),
    }, { name: '乙' })
    await patientWithRecall({ dueDate: addDays(today, 5), step: 'LINE_SENT', lineSentAt: addDays(today, -5) }, { name: '丙' })
    await patientWithRecall({ dueDate: addDays(today, 8) }, { name: '丁' })
    await patientWithRecall({ dueDate: addDays(today, 7), status: 'CONFIRMED' }, { name: '戊' })
    await patientWithRecall({ dueDate: addDays(today, -30), onHold: true }, { name: '己' })

    const { data } = (await agent.get('/api/recalls/today').expect(200)).body
    expect(data.items.map((i) => i.patient.name)).toEqual(['丙', '乙', '甲'])
    expect(data.summary).toEqual({ total: 3, overdue: 1 })
    expect(data.items[0].nextAction).toEqual({ action: 'CALL_1', actionDate: addDays(today, -2), overdueDays: 2 })
    expect(data.counts).toEqual({ 'confirmed-no-show': 0, 'import-overdue': 1, unreachable: 0 })
  })

  it('asks for a call instead of LINE for patients without LINE', async () => {
    await patientWithRecall({ dueDate: addDays(today, 7) }, { hasLine: false })
    const { data } = (await agent.get('/api/recalls/today').expect(200)).body
    expect(data.items[0].nextAction.action).toBe('CALL_1')
  })
})

describe('GET /api/recalls?list=', () => {
  it('returns each secondary list', async () => {
    await patientWithRecall({ dueDate: addDays(today, -1), status: 'CONFIRMED' }, { name: '確認未到' })
    await patientWithRecall({ dueDate: addDays(today, 1), status: 'CONFIRMED' }, { name: '確認未過期' })
    await patientWithRecall({ dueDate: addDays(today, -40), onHold: true }, { name: '過期匯入' })
    await patientWithRecall({ step: 'CALLED_3', status: 'UNREACHABLE' }, { name: '聯絡不上' })

    const names = async (list) =>
      (await agent.get(`/api/recalls?list=${list}`).expect(200)).body.data.items.map((i) => i.patient.name)
    expect(await names('confirmed-no-show')).toEqual(['確認未到'])
    expect(await names('import-overdue')).toEqual(['過期匯入'])
    expect(await names('unreachable')).toEqual(['聯絡不上'])
  })

  it('rejects an unknown list', async () => {
    await agent.get('/api/recalls?list=everything').expect(400)
  })
})

describe('POST /api/recalls/:id/actions', () => {
  it('records LINE sent, bumps the version and logs an event', async () => {
    const recall = await patientWithRecall({ dueDate: addDays(today, 7) })
    const res = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'LINE_SENT', version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ step: 'LINE_SENT', lineSentAt: today, version: 1 })
    expect(res.body.data.recall.nextAction).toEqual({ action: 'CALL_1', actionDate: addDays(today, 3), overdueDays: 0 })
    const event = await prisma.recallEvent.findUnique({ where: { id: res.body.data.eventId } })
    expect(event).toMatchObject({ type: 'ACTION', action: 'LINE_SENT' })
    const todayList = (await agent.get('/api/recalls/today')).body.data
    expect(todayList.items).toHaveLength(0)
  })

  it('marks UNREACHABLE on the third unanswered call', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_2', call2At: addDays(today, -2) })
    const res = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'CALL_NO_ANSWER', version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ step: 'CALLED_3', call3At: today, status: 'UNREACHABLE', nextAction: null })
  })

  it('confirms', async () => {
    const recall = await patientWithRecall()
    const res = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'CONFIRM', version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ status: 'CONFIRMED', confirmedAt: today })
  })

  it('rejects a second click carrying the same version without recording a second call', async () => {
    const recall = await patientWithRecall({ step: 'LINE_SENT', lineSentAt: addDays(today, -3) })
    const body = { action: 'CALL_NO_ANSWER', version: 0 }
    await agent.post(`/api/recalls/${recall.id}/actions`).send(body).expect(200)
    const second = await agent.post(`/api/recalls/${recall.id}/actions`).send(body).expect(409)
    expect(second.body.error).toEqual({ code: 'RECALL_STALE', message: '這筆資料剛被其他人更新，已重新整理' })
    expect((await prisma.recall.findUnique({ where: { id: recall.id } })).step).toBe('CALLED_1')
    expect(await prisma.recallEvent.count({ where: { recallId: recall.id } })).toBe(1)
  })

  it('rejects an action that does not fit the current step', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_1', call1At: today })
    const res = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'LINE_SENT', version: 0 }).expect(409)
    expect(res.body.error.code).toBe('ACTION_NOT_ALLOWED')
  })

  it('returns 404 for a missing recall', async () => {
    await agent.post('/api/recalls/999999/actions').send({ action: 'CONFIRM', version: 0 }).expect(404)
  })
})

describe('POST /api/recalls/:id/undo', () => {
  it('restores the previous state, once', async () => {
    const recall = await patientWithRecall({ dueDate: addDays(today, 7) })
    const acted = await agent.post(`/api/recalls/${recall.id}/actions`).send({ action: 'LINE_SENT', version: 0 }).expect(200)
    const { eventId } = acted.body.data

    const undone = await agent.post(`/api/recalls/${recall.id}/undo`).send({ eventId, version: 1 }).expect(200)
    expect(undone.body.data.recall).toMatchObject({ step: 'NOT_CONTACTED', lineSentAt: null, version: 2 })

    const again = await agent.post(`/api/recalls/${recall.id}/undo`).send({ eventId, version: 2 }).expect(409)
    expect(again.body.error.code).toBe('UNDO_NOT_ALLOWED')
  })
})

describe('PATCH /api/recalls/:id', () => {
  it('moves the step forward, filling dates, and saves the note on the event', async () => {
    const recall = await patientWithRecall()
    const res = await agent.patch(`/api/recalls/${recall.id}`)
      .send({ step: 'CALLED_1', note: '客人說下週再約', version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ step: 'CALLED_1', lineSentAt: today, call1At: today })
    const event = await prisma.recallEvent.findUnique({ where: { id: res.body.data.eventId } })
    expect(event).toMatchObject({ type: 'MANUAL_EDIT', note: '客人說下週再約' })
  })

  it('marks UNREACHABLE when moved to call 3', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_2' })
    const res = await agent.patch(`/api/recalls/${recall.id}`).send({ step: 'CALLED_3', version: 0 }).expect(200)
    expect(res.body.data.recall.status).toBe('UNREACHABLE')
  })

  it('rejects PENDING at call 3 with a zh-TW explanation', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_3', status: 'UNREACHABLE' })
    const res = await agent.patch(`/api/recalls/${recall.id}`).send({ status: 'PENDING', version: 0 }).expect(400)
    expect(res.body.error).toEqual({
      code: 'PENDING_AT_CALLED_3', message: '已撥打 3 次的追蹤無法設為未確認，請同時將步驟改回較早的階段',
    })
  })

  it('does not allow COMPLETED by hand', async () => {
    const recall = await patientWithRecall()
    await agent.patch(`/api/recalls/${recall.id}`).send({ status: 'COMPLETED', version: 0 }).expect(400)
  })

  it('refuses to edit a completed recall', async () => {
    const recall = await patientWithRecall({ status: 'COMPLETED' })
    const res = await agent.patch(`/api/recalls/${recall.id}`).send({ dueDate: addDays(today, 30), version: 0 }).expect(409)
    expect(res.body.error.code).toBe('RECALL_COMPLETED')
  })

  it('requires at least one change', async () => {
    const recall = await patientWithRecall()
    await agent.patch(`/api/recalls/${recall.id}`).send({ version: 0 }).expect(400)
  })
})

describe('POST /api/recalls/:id/restart', () => {
  it('restarts an unreachable recall with a new due date', async () => {
    const recall = await patientWithRecall({ step: 'CALLED_3', status: 'UNREACHABLE', call3At: addDays(today, -1) })
    const dueDate = addDays(today, 7)
    const res = await agent.post(`/api/recalls/${recall.id}/restart`).send({ dueDate, version: 0 }).expect(200)
    expect(res.body.data.recall).toMatchObject({ status: 'PENDING', step: 'NOT_CONTACTED', call3At: null, dueDate, onHold: false })
    const event = await prisma.recallEvent.findUnique({ where: { id: res.body.data.eventId } })
    expect(event.type).toBe('RESTART')
  })

  it('releases an on-hold import into today\'s list', async () => {
    const recall = await patientWithRecall({ dueDate: addDays(today, -40), onHold: true })
    await agent.post(`/api/recalls/${recall.id}/restart`).send({ dueDate: addDays(today, 7), version: 0 }).expect(200)
    const { data } = (await agent.get('/api/recalls/today')).body
    expect(data.items.map((i) => i.id)).toEqual([recall.id])
  })

  it('refuses a recall that is still in progress', async () => {
    const recall = await patientWithRecall()
    const res = await agent.post(`/api/recalls/${recall.id}/restart`).send({ dueDate: addDays(today, 7), version: 0 }).expect(409)
    expect(res.body.error.code).toBe('RESTART_NOT_ALLOWED')
  })

  it('refuses a due date in the past', async () => {
    const recall = await patientWithRecall({ status: 'UNREACHABLE', step: 'CALLED_3' })
    const res = await agent.post(`/api/recalls/${recall.id}/restart`).send({ dueDate: addDays(today, -1), version: 0 }).expect(400)
    expect(res.body.error.code).toBe('DUE_DATE_IN_PAST')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:integration -w server`
Expected: FAIL — `/api/recalls/...` routes return 404.

- [ ] **Step 3: Implement**

`server/src/validators/recall.validator.js`:
```js
import { z } from 'zod'
import { requestSchema, idParams, dateString } from './common.js'
import { STEPS } from '../domain/recallRules.js'

const version = z.number().int().min(0)

export const RECALL_LISTS = ['confirmed-no-show', 'import-overdue', 'unreachable']

export const listSchema = requestSchema({ query: z.object({ list: z.enum(RECALL_LISTS) }) })

export const actionSchema = requestSchema({
  params: idParams,
  body: z.object({ action: z.enum(['LINE_SENT', 'CALL_NO_ANSWER', 'CONFIRM']), version }).strict(),
})

export const undoSchema = requestSchema({
  params: idParams,
  body: z.object({ eventId: z.number().int().positive(), version }).strict(),
})

export const editSchema = requestSchema({
  params: idParams,
  body: z.object({
    step: z.enum(STEPS).optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'UNREACHABLE']).optional(),
    dueDate: dateString.optional(),
    note: z.string().trim().max(500, { message: '備註最多 500 字' }).transform((text) => text || null).optional(),
    version,
  }).strict().refine(
    (body) => body.step !== undefined || body.status !== undefined || body.dueDate !== undefined,
    { message: '沒有要修改的欄位' },
  ),
})

export const restartSchema = requestSchema({
  params: idParams,
  body: z.object({ dueDate: dateString, version }).strict(),
})
```

`server/src/services/recall.service.js`:
```js
import { prisma } from '../lib/prisma.js'
import { todayInClinic, toDbDate } from '../lib/dates.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js'
import { recallFromDb, recallFieldsToDb } from '../mappers/recall.mapper.js'
import {
  applyAction, applyManualEdit, buildTodayItems, canRestart, restartFields, snapshot, withNextAction,
} from '../domain/recallRules.js'
import { getSettings } from './setting.service.js'

const LIST_QUERIES = {
  'confirmed-no-show': (today) => ({
    where: { status: 'CONFIRMED', dueDate: { lt: toDbDate(today) } },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  }),
  'import-overdue': () => ({
    where: { onHold: true, status: 'PENDING' },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  }),
  unreachable: () => ({
    where: { status: 'UNREACHABLE' },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  }),
}

function toRecallWithPatient(row) {
  const { id, name, phoneNumber, hasLine } = row.patient
  return { ...recallFromDb(row), patient: { id, name, phoneNumber, hasLine } }
}

function staleError() {
  return new ConflictError('RECALL_STALE', '這筆資料剛被其他人更新，已重新整理')
}

async function countLists(today) {
  const entries = await Promise.all(
    Object.entries(LIST_QUERIES).map(async ([list, query]) => [list, await prisma.recall.count({ where: query(today).where })]),
  )
  return Object.fromEntries(entries)
}

export async function getToday() {
  const today = todayInClinic()
  const [rows, settings, counts] = await Promise.all([
    prisma.recall.findMany({ where: { status: 'PENDING', onHold: false }, include: { patient: true } }),
    getSettings(),
    countLists(today),
  ])
  const items = buildTodayItems(rows.map(toRecallWithPatient), settings, today)
  const overdue = items.filter((item) => item.nextAction.overdueDays > 0).length
  return { today, summary: { total: items.length, overdue }, counts, items }
}

export async function getList(list) {
  const today = todayInClinic()
  const [rows, settings] = await Promise.all([
    prisma.recall.findMany({ ...LIST_QUERIES[list](today), include: { patient: true } }),
    getSettings(),
  ])
  return {
    items: rows.map((row) => withNextAction(toRecallWithPatient(row), row.patient.hasLine, settings, today)),
  }
}

async function loadForUpdate(tx, id, version) {
  const row = await tx.recall.findUnique({ where: { id }, include: { patient: true } })
  if (!row) throw new NotFoundError('RECALL_NOT_FOUND', '找不到這筆回診追蹤')
  if (row.version !== version) throw staleError()
  return row
}

// Optimistic concurrency: the update only applies if nobody changed the row since it was read.
async function writeChange(tx, row, fields, event) {
  const { count } = await tx.recall.updateMany({
    where: { id: row.id, version: row.version },
    data: { ...recallFieldsToDb(fields), version: { increment: 1 } },
  })
  if (count === 0) throw staleError()
  const before = snapshot(recallFromDb(row))
  const created = await tx.recallEvent.create({
    data: { recallId: row.id, ...event, before, after: { ...before, ...fields } },
  })
  return created.id
}

async function result(tx, id, eventId, today) {
  const row = await tx.recall.findUnique({ where: { id }, include: { patient: true } })
  const settings = await getSettings(tx)
  return { recall: withNextAction(toRecallWithPatient(row), row.patient.hasLine, settings, today), eventId }
}

export async function recordAction(id, { action, version }) {
  const today = todayInClinic()
  return prisma.$transaction(async (tx) => {
    const row = await loadForUpdate(tx, id, version)
    const patch = applyAction(recallFromDb(row), row.patient.hasLine, action, today)
    if (!patch) throw new ConflictError('ACTION_NOT_ALLOWED', '目前的步驟無法執行這個動作，請重新整理')
    const eventId = await writeChange(tx, row, patch, { type: 'ACTION', action })
    return result(tx, id, eventId, today)
  })
}

export async function undoAction(id, { eventId, version }) {
  const today = todayInClinic()
  return prisma.$transaction(async (tx) => {
    const row = await loadForUpdate(tx, id, version)
    const latest = await tx.recallEvent.findFirst({ where: { recallId: id }, orderBy: { id: 'desc' } })
    if (!latest || latest.id !== eventId || latest.type !== 'ACTION') {
      throw new ConflictError('UNDO_NOT_ALLOWED', '只能復原這筆追蹤的最後一個動作')
    }
    const undoEventId = await writeChange(tx, row, latest.before, { type: 'UNDO', note: '復原上一個動作' })
    return result(tx, id, undoEventId, today)
  })
}

export async function editRecall(id, { step, status, dueDate, note, version }) {
  const today = todayInClinic()
  return prisma.$transaction(async (tx) => {
    const row = await loadForUpdate(tx, id, version)
    const edit = applyManualEdit(recallFromDb(row), { step, status, dueDate }, today)
    if (edit.error === 'RECALL_COMPLETED') throw new ConflictError('RECALL_COMPLETED', '已回診的追蹤無法修改')
    if (edit.error === 'PENDING_AT_CALLED_3') {
      throw new ValidationError('PENDING_AT_CALLED_3', '已撥打 3 次的追蹤無法設為未確認，請同時將步驟改回較早的階段')
    }
    const eventId = await writeChange(tx, row, edit.patch, { type: 'MANUAL_EDIT', note: note ?? null })
    return result(tx, id, eventId, today)
  })
}

export async function restartRecall(id, { dueDate, version }) {
  const today = todayInClinic()
  if (dueDate < today) throw new ValidationError('DUE_DATE_IN_PAST', '回診日不可早於今天')
  return prisma.$transaction(async (tx) => {
    const row = await loadForUpdate(tx, id, version)
    if (!canRestart(recallFromDb(row), today)) {
      throw new ConflictError('RESTART_NOT_ALLOWED', '這筆追蹤目前不需要重新追蹤')
    }
    const eventId = await writeChange(tx, row, restartFields(dueDate), { type: 'RESTART' })
    return result(tx, id, eventId, today)
  })
}
```

`server/src/controllers/recall.controller.js`:
```js
import * as recallService from '../services/recall.service.js'

export async function getToday(req, res) {
  res.json({ success: true, data: await recallService.getToday() })
}

export async function getList(req, res) {
  res.json({ success: true, data: await recallService.getList(req.valid.query.list) })
}

export async function recordAction(req, res) {
  res.json({ success: true, data: await recallService.recordAction(req.valid.params.id, req.valid.body) })
}

export async function undoAction(req, res) {
  res.json({ success: true, data: await recallService.undoAction(req.valid.params.id, req.valid.body) })
}

export async function editRecall(req, res) {
  res.json({ success: true, data: await recallService.editRecall(req.valid.params.id, req.valid.body) })
}

export async function restartRecall(req, res) {
  res.json({ success: true, data: await recallService.restartRecall(req.valid.params.id, req.valid.body) })
}
```

`server/src/routes/recall.routes.js`:
```js
import { Router } from 'express'
import * as recallController from '../controllers/recall.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { listSchema, actionSchema, undoSchema, editSchema, restartSchema } from '../validators/recall.validator.js'

export function recallRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.get('/today', recallController.getToday)
  router.get('/', validate(listSchema), recallController.getList)
  router.post('/:id/actions', validate(actionSchema), recallController.recordAction)
  router.post('/:id/undo', validate(undoSchema), recallController.undoAction)
  router.patch('/:id', validate(editSchema), recallController.editRecall)
  router.post('/:id/restart', validate(restartSchema), recallController.restartRecall)
  return router
}
```

In `server/src/routes/index.js` add `import { recallRoutes } from './recall.routes.js'` and `router.use('/recalls', recallRoutes())`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): add today list, recall actions with undo, manual edit and restart" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Excel import

**Files:**
- Create: `server/src/domain/importRows.js`, `server/src/services/import.service.js`, `server/src/validators/import.validator.js`, `server/src/controllers/import.controller.js`, `server/src/routes/import.routes.js`
- Create: `server/tests/integration/helpers/xlsx.js`
- Modify: `server/src/routes/index.js`
- Test: `server/tests/unit/importRows.test.js`, `server/tests/integration/import.test.js`

**Interfaces:**
- Consumes: `PHONE_PATTERN`, `NAME_MAX_LENGTH`, `COMMENT_MAX_LENGTH`, `normalizePhoneText` (Task 7); `getSettings`; validators `personName`, `phoneNumber`, `pastOrTodayDate`, `commentText`.
- Produces:
  - `IMPORT_COLUMNS` (`key`, `header`, `required`), `MAX_IMPORT_ROWS = 5000`, `isBlank`, `parseDateValue`, `normalizeImportPhone`, `parseHasLine`, `validateImportRow(raw, today) → { data } | { errors: [{ column, message }] }`
  - `ImportRowData` = `{ name, birthDate, phoneNumber, lastVisitDate, hasLine, comment }`
  - `GET /api/imports/template` → `.xlsx`
  - `POST /api/imports/preview` (multipart field `file`) → `{ rows: [{ rowNumber, status: 'valid'|'error'|'duplicate-in-file'|'duplicate-existing', raw, data?, errors?, dueDate?, onHold? }], summary: { total, valid, error, duplicate, onHold } }`
  - `POST /api/imports/commit` `{ rows: ImportRowData[] }` → 201 `{ imported, onHold }`

- [ ] **Step 1: Install dependencies**

```bash
npm install -w server exceljs@^4 multer@^2
```

- [ ] **Step 2: Write the failing unit tests**

`server/tests/unit/importRows.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { parseDateValue, normalizeImportPhone, parseHasLine, validateImportRow } from '../../src/domain/importRows.js'

describe('parseDateValue', () => {
  it.each([
    [new Date(Date.UTC(1990, 0, 31)), '1990-01-31'],
    [32874, '1990-01-01'],
    ['1990-01-31', '1990-01-31'],
    ['1990/1/31', '1990-01-31'],
    ['79/1/31', '1990-01-31'],
    ['079/01/31', '1990-01-31'],
    ['民國79年1月31日', '1990-01-31'],
    ['115/10/06', '2026-10-06'],
  ])('parses %s', (input, expected) => expect(parseDateValue(input)).toBe(expected))

  it.each(['2026-02-30', 'abc', '', null, '1990-1'])('rejects %s', (input) => {
    expect(parseDateValue(input)).toBeNull()
  })
})

describe('normalizeImportPhone', () => {
  it('restores the leading zero Excel drops from numeric cells', () => {
    expect(normalizeImportPhone(912345678)).toBe('0912345678')
    expect(normalizeImportPhone(223456789)).toBe('0223456789')
  })
  it('strips separators from text', () => {
    expect(normalizeImportPhone('0912-345-678')).toBe('0912345678')
    expect(normalizeImportPhone('(02) 2345-6789')).toBe('0223456789')
  })
})

describe('parseHasLine', () => {
  it.each([[null, true], ['', true], ['是', true], ['Y', true], [true, true], ['否', false], ['無', false], ['N', false]])(
    '%s → %s', (input, expected) => expect(parseHasLine(input)).toBe(expected),
  )
  it('returns null for anything else', () => expect(parseHasLine('也許')).toBeNull())
})

describe('validateImportRow', () => {
  const TODAY = '2026-10-06'
  const raw = { name: ' 王小明　', birthDate: '79/1/31', phoneNumber: 912345678, lastVisitDate: '2026-04-01', hasLine: '是', comment: '' }

  it('returns clean data for a valid row', () => {
    expect(validateImportRow(raw, TODAY)).toEqual({
      data: { name: '王小明', birthDate: '1990-01-31', phoneNumber: '0912345678', lastVisitDate: '2026-04-01', hasLine: true, comment: null },
    })
  })

  it('reports each problem against its zh-TW column header', () => {
    const { errors } = validateImportRow(
      { name: '', birthDate: '1990-13-01', phoneNumber: '123', lastVisitDate: '2026-10-07', hasLine: '也許', comment: null },
      TODAY,
    )
    expect(errors).toEqual([
      { column: '姓名', message: '必填' },
      { column: '生日', message: '日期格式錯誤（例：1990-01-31 或 79/1/31）' },
      { column: '電話', message: '電話格式錯誤，應為 0 開頭的 9–10 位數字' },
      { column: '上次看診日', message: '上次看診日不可晚於今天' },
      { column: '有加 LINE', message: '請填「是」或「否」' },
    ])
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm run test:unit -w server`
Expected: FAIL — cannot find `src/domain/importRows.js`.

- [ ] **Step 4: Implement the pure row parsing**

`server/src/domain/importRows.js`:
```js
import { isValidDateString } from '../lib/dates.js'
import { PHONE_PATTERN, NAME_MAX_LENGTH, COMMENT_MAX_LENGTH, normalizePhoneText } from './patientRules.js'

export const IMPORT_COLUMNS = [
  { key: 'name', header: '姓名', required: true },
  { key: 'birthDate', header: '生日', required: true },
  { key: 'phoneNumber', header: '電話', required: true },
  { key: 'lastVisitDate', header: '上次看診日', required: true },
  { key: 'hasLine', header: '有加 LINE', required: false },
  { key: 'comment', header: '備註', required: false },
]

export const MAX_IMPORT_ROWS = 5000

const HEADER_OF = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column.key, column.header]))
const DATE_FORMAT_MESSAGE = '日期格式錯誤（例：1990-01-31 或 79/1/31）'
const EXCEL_EPOCH_OFFSET_DAYS = 25569 // days from 1899-12-30 to 1970-01-01
const MS_PER_DAY = 86_400_000
const ROC_YEAR_OFFSET = 1911
const YES = new Set(['是', '有', 'y', 'yes', 'true', '1', 'v'])
const NO = new Set(['否', '無', '沒有', 'n', 'no', 'false', '0'])

export function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function toDateString(year, month, day) {
  const text = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isValidDateString(text) ? text : null
}

export function parseDateValue(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 2958465) return null
    return new Date(Math.round((value - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY)).toISOString().slice(0, 10)
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (match) return toDateString(Number(match[1]), Number(match[2]), Number(match[3]))
  match = text.match(/^(?:民國)?\s*(\d{2,3})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (match) return toDateString(Number(match[1]) + ROC_YEAR_OFFSET, Number(match[2]), Number(match[3]))
  return null
}

// Excel stores 0912345678 typed into a number cell as 912345678.
export function normalizeImportPhone(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? `0${value}` : null
  if (typeof value !== 'string') return null
  return normalizePhoneText(value)
}

export function parseHasLine(value) {
  if (isBlank(value)) return true
  if (typeof value === 'boolean') return value
  const text = String(value).trim().toLowerCase()
  if (YES.has(text)) return true
  if (NO.has(text)) return false
  return null
}

export function validateImportRow(raw, today) {
  const errors = []
  const fail = (key, message) => errors.push({ column: HEADER_OF[key], message })

  const name = isBlank(raw.name) ? '' : String(raw.name).trim()
  if (!name) fail('name', '必填')
  else if (name.length > NAME_MAX_LENGTH) fail('name', `姓名最多 ${NAME_MAX_LENGTH} 字`)

  const birthDate = parseDateValue(raw.birthDate)
  if (isBlank(raw.birthDate)) fail('birthDate', '必填')
  else if (!birthDate) fail('birthDate', DATE_FORMAT_MESSAGE)
  else if (birthDate > today) fail('birthDate', '生日不可晚於今天')

  const phoneNumber = normalizeImportPhone(raw.phoneNumber)
  if (isBlank(raw.phoneNumber)) fail('phoneNumber', '必填')
  else if (!phoneNumber || !PHONE_PATTERN.test(phoneNumber)) fail('phoneNumber', '電話格式錯誤，應為 0 開頭的 9–10 位數字')

  const lastVisitDate = parseDateValue(raw.lastVisitDate)
  if (isBlank(raw.lastVisitDate)) fail('lastVisitDate', '必填')
  else if (!lastVisitDate) fail('lastVisitDate', DATE_FORMAT_MESSAGE)
  else if (lastVisitDate > today) fail('lastVisitDate', '上次看診日不可晚於今天')

  const hasLine = parseHasLine(raw.hasLine)
  if (hasLine === null) fail('hasLine', '請填「是」或「否」')

  const comment = isBlank(raw.comment) ? null : String(raw.comment).trim()
  if (comment && comment.length > COMMENT_MAX_LENGTH) fail('comment', `備註最多 ${COMMENT_MAX_LENGTH} 字`)

  return errors.length ? { errors } : { data: { name, birthDate, phoneNumber, lastVisitDate, hasLine, comment } }
}
```

Run: `npm run test:unit -w server` — Expected: PASS.

- [ ] **Step 5: Write the failing integration tests**

`server/tests/integration/helpers/xlsx.js`:
```js
import ExcelJS from 'exceljs'

export const HEADERS = ['姓名', '生日', '電話', '上次看診日', '有加 LINE', '備註']

export async function buildXlsx(rows, headers = HEADERS) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('客人資料')
  sheet.addRow(headers)
  rows.forEach((row) => sheet.addRow(row))
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
```

`server/tests/integration/import.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'
import ExcelJS from 'exceljs'
import { prisma } from '../../src/lib/prisma.js'
import { addDays, addMonths, todayInClinic } from '../../src/lib/dates.js'
import { resetDb } from './helpers/db.js'
import { loggedInAgent } from './helpers/auth.js'
import { createPatient } from './helpers/factories.js'
import { buildXlsx } from './helpers/xlsx.js'

let agent
let today
beforeEach(async () => {
  await resetDb()
  agent = await loggedInAgent()
  today = todayInClinic()
})

const preview = (buffer) => agent.post('/api/imports/preview').attach('file', buffer, 'patients.xlsx')

describe('GET /api/imports/template', () => {
  it('downloads a workbook with the expected headers', async () => {
    const res = await agent.get('/api/imports/template').buffer(true)
      .parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))) })
      .expect(200)
    expect(res.headers['content-type']).toContain('spreadsheetml')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(res.body)
    expect(workbook.worksheets[0].getRow(1).values.slice(1)).toEqual(['姓名', '生日', '電話', '上次看診日', '有加 LINE', '備註'])
  })
})

describe('POST /api/imports/preview', () => {
  it('classifies every row', async () => {
    await createPatient({ name: '已存在', birthDate: '1980-01-01' })
    const recent = addDays(today, -30)
    const old = addDays(today, -400)
    const buffer = await buildXlsx([
      ['王小明', '79/1/31', 912345678, recent, '是', ''],
      ['陳美玲', new Date(Date.UTC(1985, 4, 5)), '0933-111-222', old, '否', '怕痛'],
      ['', '1990-01-01', '0912345678', recent, '', ''],
      ['王小明', '79/1/31', '0912000000', recent, '', ''],
      ['已存在', '1980-01-01', '0912345678', recent, '', ''],
    ])
    const { data } = (await preview(buffer).expect(200)).body
    expect(data.rows.map((r) => [r.rowNumber, r.status])).toEqual([
      [2, 'valid'], [3, 'valid'], [4, 'error'], [5, 'duplicate-in-file'], [6, 'duplicate-existing'],
    ])
    expect(data.rows[0]).toMatchObject({
      data: { name: '王小明', birthDate: '1990-01-31', phoneNumber: '0912345678', hasLine: true },
      dueDate: addMonths(recent, 6), onHold: false,
    })
    expect(data.rows[1]).toMatchObject({ data: { birthDate: '1985-05-05', hasLine: false }, onHold: true })
    expect(data.rows[2].errors).toEqual([{ column: '姓名', message: '必填' }])
    expect(data.summary).toEqual({ total: 5, valid: 2, error: 1, duplicate: 2, onHold: 1 })
  })

  it('reports missing required columns', async () => {
    const res = await preview(await buildXlsx([], ['姓名', '電話'])).expect(400)
    expect(res.body.error).toEqual({ code: 'MISSING_COLUMNS', message: '缺少欄位：生日、上次看診日' })
  })

  it('rejects a file that is not xlsx', async () => {
    const res = await agent.post('/api/imports/preview').attach('file', Buffer.from('hello'), 'notes.xlsx').expect(400)
    expect(res.body.error.code).toBe('INVALID_FILE')
  })

  it('requires a file', async () => {
    const res = await agent.post('/api/imports/preview').expect(400)
    expect(res.body.error.code).toBe('FILE_REQUIRED')
  })
})

describe('POST /api/imports/commit', () => {
  const row = (overrides) => ({
    name: '王小明', birthDate: '1990-01-31', phoneNumber: '0912345678',
    lastVisitDate: addDays(today, -30), hasLine: true, comment: null, ...overrides,
  })

  it('creates patients, visits and recalls; past-due ones go on hold', async () => {
    const res = await agent.post('/api/imports/commit').send({
      rows: [row(), row({ name: '陳美玲', lastVisitDate: addDays(today, -400) })],
    }).expect(201)
    expect(res.body.data).toEqual({ imported: 2, onHold: 1 })
    expect(await prisma.patient.count()).toBe(2)
    expect(await prisma.visit.count()).toBe(2)
    expect(await prisma.recall.count({ where: { onHold: true } })).toBe(1)

    const overdue = (await agent.get('/api/recalls?list=import-overdue')).body.data.items
    expect(overdue.map((i) => i.patient.name)).toEqual(['陳美玲'])
    const todayItems = (await agent.get('/api/recalls/today')).body.data.items
    expect(todayItems).toHaveLength(0)
  })

  it('writes nothing when any row already exists', async () => {
    await createPatient({ name: '已存在', birthDate: '1980-01-01' })
    const res = await agent.post('/api/imports/commit').send({
      rows: [row(), row({ name: '已存在', birthDate: '1980-01-01' })],
    }).expect(409)
    expect(res.body.error.code).toBe('IMPORT_DUPLICATE')
    expect(await prisma.patient.count()).toBe(1)
  })

  it('re-validates rows sent by the client', async () => {
    await agent.post('/api/imports/commit').send({ rows: [row({ phoneNumber: '123' })] }).expect(400)
    await agent.post('/api/imports/commit').send({ rows: [row(), row()] }).expect(400)
  })
})
```

- [ ] **Step 6: Run to verify they fail**

Run: `npm run test:integration -w server`
Expected: FAIL — `/api/imports/...` return 404.

- [ ] **Step 7: Implement the service, validator, controller and routes**

`server/src/services/import.service.js`:
```js
import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma.js'
import { addMonths, fromDbDate, todayInClinic, toDbDate } from '../lib/dates.js'
import { ConflictError, ValidationError } from '../errors/AppError.js'
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, isBlank, validateImportRow } from '../domain/importRows.js'
import { getSettings } from './setting.service.js'

const NAME_CHUNK = 1000

// MySQL's default collation compares names case-insensitively, so the key does too.
function patientKey({ name, birthDate }) {
  return `${name.toLowerCase()}\u0000${birthDate}`
}

function cellValue(cell) {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (value instanceof Date || typeof value !== 'object') return value
  if ('result' in value) return value.result ?? null
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  if ('text' in value) return value.text
  return null
}

function displayValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return isBlank(value) ? '' : String(value)
}

async function readRows(buffer) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new ValidationError('INVALID_FILE', '無法讀取檔案，請確認是 .xlsx 格式')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new ValidationError('INVALID_FILE', '檔案中沒有工作表')

  const columnIndex = {}
  sheet.getRow(1).eachCell((cell, col) => {
    const header = String(cellValue(cell) ?? '').trim()
    const column = IMPORT_COLUMNS.find((c) => c.header === header)
    if (column) columnIndex[column.key] = col
  })
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !columnIndex[c.key]).map((c) => c.header)
  if (missing.length) throw new ValidationError('MISSING_COLUMNS', `缺少欄位：${missing.join('、')}`)

  const rows = []
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const raw = Object.fromEntries(IMPORT_COLUMNS.map((c) => [
      c.key, columnIndex[c.key] ? cellValue(row.getCell(columnIndex[c.key])) : null,
    ]))
    if (Object.values(raw).every(isBlank)) continue
    rows.push({ rowNumber, raw })
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ValidationError('TOO_MANY_ROWS', `一次最多匯入 ${MAX_IMPORT_ROWS} 筆`)
    }
  }
  if (rows.length === 0) throw new ValidationError('EMPTY_FILE', '檔案中沒有資料')
  return rows
}

// Map of patientKey → id for existing patients matching any of the given rows.
async function findPatientIds(db, rows) {
  const names = [...new Set(rows.map((r) => r.name))]
  const ids = new Map()
  for (let i = 0; i < names.length; i += NAME_CHUNK) {
    const found = await db.patient.findMany({
      where: { name: { in: names.slice(i, i + NAME_CHUNK) } },
      select: { id: true, name: true, birthDate: true },
    })
    for (const p of found) ids.set(patientKey({ name: p.name, birthDate: fromDbDate(p.birthDate) }), p.id)
  }
  return ids
}

export async function buildTemplate() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('客人資料')
  sheet.columns = IMPORT_COLUMNS.map((c) => ({
    header: c.header, key: c.key, width: c.key === 'comment' ? 30 : 16, style: { numFmt: '@' },
  }))
  sheet.getRow(1).font = { bold: true }

  const help = workbook.addWorksheet('說明')
  ;[
    ['欄位', '說明'],
    ['姓名', '必填'],
    ['生日', '必填，例：1990-01-31、1990/1/31 或民國 79/1/31'],
    ['電話', '必填，0 開頭的 9–10 位數字，可含 - 或空白'],
    ['上次看診日', '必填，格式同生日；系統會自動算出下次回診日'],
    ['有加 LINE', '填「是」或「否」，空白視為「是」'],
    ['備註', '選填'],
  ].forEach((row) => help.addRow(row))
  help.getColumn(2).width = 50

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function previewImport(buffer) {
  if (!buffer) throw new ValidationError('FILE_REQUIRED', '請選擇要匯入的檔案')
  const today = todayInClinic()
  const [rows, settings] = await Promise.all([readRows(buffer), getSettings()])

  const checked = rows.map(({ rowNumber, raw }) => ({
    rowNumber,
    raw: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, displayValue(value)])),
    ...validateImportRow(raw, today),
  }))
  const existing = await findPatientIds(prisma, checked.filter((r) => r.data).map((r) => r.data))

  const seen = new Set()
  const out = checked.map(({ rowNumber, raw, data, errors }) => {
    if (errors) return { rowNumber, status: 'error', raw, errors }
    const key = patientKey(data)
    if (seen.has(key)) return { rowNumber, status: 'duplicate-in-file', raw, data }
    seen.add(key)
    if (existing.has(key)) return { rowNumber, status: 'duplicate-existing', raw, data }
    const dueDate = addMonths(data.lastVisitDate, settings.recallIntervalMonths)
    return { rowNumber, status: 'valid', raw, data, dueDate, onHold: dueDate < today }
  })

  const count = (predicate) => out.filter(predicate).length
  return {
    rows: out,
    summary: {
      total: out.length,
      valid: count((r) => r.status === 'valid'),
      error: count((r) => r.status === 'error'),
      duplicate: count((r) => r.status.startsWith('duplicate')),
      onHold: count((r) => r.status === 'valid' && r.onHold),
    },
  }
}

export async function commitImport(rows) {
  const today = todayInClinic()
  const keys = new Set()
  for (const row of rows) {
    const key = patientKey(row)
    if (keys.has(key)) throw new ValidationError('IMPORT_DUPLICATE_IN_FILE', `匯入資料中有重複的客人：${row.name}`)
    keys.add(key)
  }

  return prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx)
    const existing = await findPatientIds(tx, rows)
    const clash = rows.find((row) => existing.has(patientKey(row)))
    if (clash) throw new ConflictError('IMPORT_DUPLICATE', `「${clash.name}」已經存在，請重新預覽後再匯入`)

    await tx.patient.createMany({
      data: rows.map((r) => ({
        name: r.name, phoneNumber: r.phoneNumber, birthDate: toDbDate(r.birthDate), hasLine: r.hasLine, comment: r.comment,
      })),
    })
    const patientIds = await findPatientIds(tx, rows)

    await tx.visit.createMany({
      data: rows.map((r) => ({ patientId: patientIds.get(patientKey(r)), visitDate: toDbDate(r.lastVisitDate) })),
    })
    const visits = await tx.visit.findMany({
      where: { patientId: { in: [...patientIds.values()] } },
      select: { id: true, patientId: true },
    })
    const visitIdByPatient = new Map(visits.map((v) => [v.patientId, v.id]))

    let onHold = 0
    await tx.recall.createMany({
      data: rows.map((r) => {
        const patientId = patientIds.get(patientKey(r))
        const dueDate = addMonths(r.lastVisitDate, settings.recallIntervalMonths)
        const held = dueDate < today
        if (held) onHold += 1
        return { patientId, visitId: visitIdByPatient.get(patientId), dueDate: toDbDate(dueDate), onHold: held }
      }),
    })
    return { imported: rows.length, onHold }
  }, { timeout: 120_000, maxWait: 10_000 })
}
```

`server/src/validators/import.validator.js`:
```js
import { z } from 'zod'
import { requestSchema, personName, phoneNumber, pastOrTodayDate, commentText } from './common.js'
import { MAX_IMPORT_ROWS } from '../domain/importRows.js'

const importRow = z.object({
  name: personName,
  birthDate: pastOrTodayDate,
  phoneNumber,
  lastVisitDate: pastOrTodayDate,
  hasLine: z.boolean(),
  comment: commentText,
}).strict()

export const commitSchema = requestSchema({
  body: z.object({
    rows: z.array(importRow)
      .min(1, { message: '沒有可匯入的資料' })
      .max(MAX_IMPORT_ROWS, { message: `一次最多匯入 ${MAX_IMPORT_ROWS} 筆` }),
  }).strict(),
})
```

`server/src/controllers/import.controller.js`:
```js
import * as importService from '../services/import.service.js'

export async function downloadTemplate(req, res) {
  const buffer = await importService.buildTemplate()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="recall-import-template.xlsx"')
  res.send(buffer)
}

export async function preview(req, res) {
  res.json({ success: true, data: await importService.previewImport(req.file?.buffer) })
}

export async function commit(req, res) {
  res.status(201).json({ success: true, data: await importService.commitImport(req.valid.body.rows) })
}
```

`server/src/routes/import.routes.js`:
```js
import { Router } from 'express'
import multer from 'multer'
import * as importController from '../controllers/import.controller.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { commitSchema } from '../validators/import.validator.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } })

export function importRoutes() {
  const router = Router()
  router.use(requireAuth)
  router.get('/template', importController.downloadTemplate)
  router.post('/preview', upload.single('file'), importController.preview)
  router.post('/commit', validate(commitSchema), importController.commit)
  return router
}
```

In `server/src/routes/index.js` add `import { importRoutes } from './import.routes.js'` and `router.use('/imports', importRoutes())`.

- [ ] **Step 8: Run to verify everything passes**

Run: `npm test -w server`
Expected: PASS (all unit and integration tests).

- [ ] **Step 9: Commit**

```bash
git add server
git commit -m "feat(server): add Excel import with preview, ROC dates and all-or-nothing commit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 2 — Frontend

### Task 11: Client scaffold, API client, auth and layout

**Files:**
- Create: `client/package.json`, `client/vite.config.js`, `client/index.html`
- Create: `client/src/main.jsx`, `client/src/App.jsx`, `client/src/index.css`, `client/src/labels.js`
- Create: `client/src/services/api.js`, `client/src/hooks/useAuth.js`
- Create: `client/src/components/Button.jsx`, `Field.jsx`, `PageMessage.jsx`, `Toast.jsx`, `Layout.jsx`, `RequireAuth.jsx`
- Create: `client/src/pages/LoginPage.jsx`, `client/src/pages/DashboardPage.jsx`
- Create: `client/src/test/setup.js`, `client/src/test/render.jsx`
- Modify: `package.json` (root)
- Test: `client/src/services/api.test.js`, `client/src/components/Toast.test.jsx`

**Interfaces:**
- Consumes: the API from Tasks 5–10.
- Produces:
  - `api.get(path)`, `api.post(path, body?)`, `api.patch(path, body)`, `api.del(path)`, `api.upload(path, formData)` — resolve to the envelope's `data`; reject with `ApiError { status, code, message, details }`
  - `setUnauthorizedHandler(fn)` — called on any 401 except `/auth/login`
  - `useMe()`, `useLogin()`, `useLogout()`, `useChangePassword()`
  - `useToast() → { show({ message, tone?: 'success'|'error', action?: { label, onClick }, duration? }), dismiss() }`
  - `Button({ variant: 'primary'|'secondary'|'danger'|'ghost' })`, `Field({ label, error, hint, children })`, `inputClass`, `PageMessage({ tone, children })`
  - labels: `STEP_LABELS`, `STATUS_LABELS`, `NEXT_ACTION_LABELS`, `ACTION_LABELS`, `EVENT_TYPE_LABELS`
  - test helper `renderWithProviders(ui, { route?, path? })` — wraps QueryClient, ToastProvider, MemoryRouter; `/patients/:id` renders `客人詳細頁`

- [ ] **Step 1: Create the client package and install dependencies**

Change the root `package.json` `workspaces` to `["server", "client"]` and its scripts to:
```json
  "scripts": {
    "dev:server": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "test": "npm test -w server && npm test -w client"
  }
```

`client/package.json`:
```json
{
  "name": "@recall/client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

```bash
npm install -w client react@^19 react-dom@^19 react-router@^7 @tanstack/react-query@^5 dayjs@^1
npm install -w client -D vite@^7 @vitejs/plugin-react@^5 tailwindcss@^4 @tailwindcss/vite@^4 vitest@^3 jsdom@^26 @testing-library/react@^16 @testing-library/dom@^10 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```

`client/vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.js'] },
})
```

`client/index.html`:
```html
<!doctype html>
<html lang="zh-Hant-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>回診追蹤系統</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`client/src/index.css`:
```css
@import "tailwindcss";

@theme {
  --font-sans: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif;
}

body {
  @apply bg-slate-50 text-slate-800 antialiased;
}
```

`client/src/test/setup.js`:
```js
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())
```

- [ ] **Step 2: Write the failing tests**

`client/src/services/api.test.js`:
```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError, setUnauthorizedHandler } from './api.js'

function respond(status, body) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError('no json')) : Promise.resolve(body)),
  })
}

describe('api', () => {
  let onUnauthorized
  beforeEach(() => {
    onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('unwraps data and sends JSON', async () => {
    const fetchMock = respond(200, { success: true, data: { id: 1 } })
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.post('/patients', { name: '王' })).resolves.toEqual({ id: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/api/patients', expect.objectContaining({
      method: 'POST', body: '{"name":"王"}', headers: { 'Content-Type': 'application/json' },
    }))
  })

  it('throws ApiError carrying the server message and details', async () => {
    vi.stubGlobal('fetch', respond(400, {
      success: false, error: { code: 'VALIDATION_ERROR', message: '電話格式錯誤', details: [{ field: 'phoneNumber', message: '電話格式錯誤' }] },
    }))
    const error = await api.get('/patients').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: '電話格式錯誤' })
    expect(error.details).toHaveLength(1)
  })

  it('treats a 200 with success:false as a failure', async () => {
    vi.stubGlobal('fetch', respond(200, { success: false, error: { code: 'X', message: '失敗' } }))
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'X' })
  })

  it('gives a zh-TW message when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: '無法連線到伺服器，請檢查網路' })
  })

  it('gives a zh-TW message when the response is not JSON', async () => {
    vi.stubGlobal('fetch', respond(502, undefined))
    await expect(api.get('/x')).rejects.toMatchObject({ status: 502, message: '系統發生錯誤，請稍後再試' })
  })

  it('calls the unauthorized handler on 401, except for login', async () => {
    vi.stubGlobal('fetch', respond(401, { success: false, error: { code: 'UNAUTHORIZED', message: '請先登入' } }))
    await api.get('/recalls/today').catch(() => {})
    expect(onUnauthorized).toHaveBeenCalledOnce()
    await api.post('/auth/login', {}).catch(() => {})
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
```

`client/src/components/Toast.test.jsx`:
```jsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { ToastProvider, useToast } from './Toast.jsx'

function Trigger({ options }) {
  const toast = useToast()
  return <button onClick={() => toast.show(options)}>show</button>
}

afterEach(() => vi.useRealTimers())

describe('Toast', () => {
  it('shows a message and hides it after the duration', () => {
    vi.useFakeTimers()
    render(<ToastProvider><Trigger options={{ message: '已記錄', duration: 1000 }} /></ToastProvider>)
    fireEvent.click(screen.getByText('show'))
    expect(screen.getByRole('status')).toHaveTextContent('已記錄')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('runs the action and closes', () => {
    const onUndo = vi.fn()
    render(<ToastProvider><Trigger options={{ message: '已記錄', action: { label: '復原', onClick: onUndo } }} /></ToastProvider>)
    fireEvent.click(screen.getByText('show'))
    fireEvent.click(screen.getByRole('button', { name: '復原' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test -w client`
Expected: FAIL — cannot find `./api.js` and `./Toast.jsx`.

- [ ] **Step 4: Implement**

`client/src/services/api.js`:
```js
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

let onUnauthorized = () => {}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

async function request(method, path, body, { isForm = false } = {}) {
  const options = { method, credentials: 'same-origin' }
  if (body !== undefined) {
    options.body = isForm ? body : JSON.stringify(body)
    if (!isForm) options.headers = { 'Content-Type': 'application/json' }
  }

  let response
  try {
    response = await fetch(`/api${path}`, options)
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '無法連線到伺服器，請檢查網路')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    const error = payload?.error ?? { code: 'UNKNOWN_ERROR', message: '系統發生錯誤，請稍後再試' }
    if (response.status === 401 && path !== '/auth/login') onUnauthorized()
    throw new ApiError(response.status, error.code, error.message, error.details)
  }
  return payload.data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, formData, { isForm: true }),
}
```

`client/src/components/Toast.jsx`:
```jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

const TONES = {
  success: 'bg-slate-800 text-white',
  error: 'bg-red-600 text-white',
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setToast(null)
  }, [])

  const show = useCallback(({ message, tone = 'success', action, duration = 4000 }) => {
    clearTimeout(timer.current)
    setToast({ message, tone, action })
    timer.current = setTimeout(() => setToast(null), duration)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl px-5 py-3 shadow-lg ${TONES[toast.tone]}`}
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="font-semibold underline underline-offset-4"
              onClick={() => {
                dismiss()
                toast.action.onClick()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
```

`client/src/labels.js`:
```js
export const STEP_LABELS = {
  NOT_CONTACTED: '尚未聯絡',
  LINE_SENT: '已傳 LINE',
  CALLED_1: '已撥打 1 次',
  CALLED_2: '已撥打 2 次',
  CALLED_3: '已撥打 3 次',
}

export const STATUS_LABELS = {
  PENDING: '未確認',
  CONFIRMED: '確認複診',
  UNREACHABLE: '聯絡不上',
  COMPLETED: '已回診',
}

export const NEXT_ACTION_LABELS = {
  SEND_LINE: '傳 LINE',
  CALL_1: '打第 1 次',
  CALL_2: '打第 2 次',
  CALL_3: '打第 3 次',
}

export const ACTION_LABELS = {
  LINE_SENT: '已傳 LINE',
  CALL_NO_ANSWER: '沒接',
  CONFIRM: '確認複診',
}

export const EVENT_TYPE_LABELS = {
  ACTION: '動作',
  MANUAL_EDIT: '手動修改',
  UNDO: '復原',
  VISIT_RECORDED: '登記看診',
  RESTART: '重新追蹤',
}
```

`client/src/components/Button.jsx`:
```jsx
const VARIANTS = {
  primary: 'bg-teal-600 text-white hover:bg-teal-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-slate-500 hover:text-slate-800',
}

export default function Button({ variant = 'primary', type = 'button', className = '', ...props }) {
  return (
    <button
      type={type}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
```

`client/src/components/Field.jsx`:
```jsx
export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100'

export default function Field({ label, error, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  )
}
```

`client/src/components/PageMessage.jsx`:
```jsx
export default function PageMessage({ tone = 'muted', children }) {
  const color = tone === 'error' ? 'text-red-600' : 'text-slate-500'
  return <p className={`py-16 text-center ${color}`}>{children}</p>
}
```

`client/src/hooks/useAuth.js`:
```js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get('/auth/me')
      } catch (error) {
        if (error.status === 401) return null
        throw error
      }
    },
    staleTime: Infinity,
    refetchInterval: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials) => api.post('/auth/login', credentials),
    onSuccess: (data) => queryClient.setQueryData(['me'], data.user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(['me'], null)
    },
  })
}

export function useChangePassword() {
  return useMutation({ mutationFn: (body) => api.patch('/auth/password', body) })
}
```

`client/src/components/RequireAuth.jsx`:
```jsx
import { Navigate } from 'react-router'
import { useMe } from '../hooks/useAuth.js'
import PageMessage from './PageMessage.jsx'

export default function RequireAuth({ children }) {
  const { data: user, isPending, isError } = useMe()
  if (isPending) return <PageMessage>載入中…</PageMessage>
  if (isError) return <PageMessage tone="error">無法連線到伺服器，請稍後再試</PageMessage>
  if (!user) return <Navigate to="/login" replace />
  return children
}
```

`client/src/components/Layout.jsx`:
```jsx
import { NavLink, Outlet } from 'react-router'
import { useLogout } from '../hooks/useAuth.js'

const NAV = [
  { to: '/', label: '今日待辦', end: true },
  { to: '/patients', label: '客人' },
  { to: '/import', label: '匯入' },
  { to: '/settings', label: '設定' },
]

export default function Layout() {
  const logout = useLogout()
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-8 px-6 py-4">
          <span className="text-lg font-semibold text-teal-700">回診追蹤</span>
          <nav className="flex gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-teal-50 font-medium text-teal-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={() => logout.mutate()} className="ml-auto text-sm text-slate-500 hover:text-slate-800">
            登出
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}
```

`client/src/pages/LoginPage.jsx`:
```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLogin } from '../hooks/useAuth.js'
import Button from '../components/Button.jsx'
import Field, { inputClass } from '../components/Field.jsx'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const [form, setForm] = useState({ username: '', password: '' })

  const submit = (event) => {
    event.preventDefault()
    login.mutate(form, { onSuccess: () => navigate('/', { replace: true }) })
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold text-teal-700">回診追蹤系統</h1>
        <Field label="帳號">
          <input className={inputClass} autoComplete="username" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="密碼">
          <input className={inputClass} type="password" autoComplete="current-password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {login.error && <p className="text-sm text-red-600">{login.error.message}</p>}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? '登入中…' : '登入'}
        </Button>
      </form>
    </div>
  )
}
```

`client/src/pages/DashboardPage.jsx` (replaced in Task 13):
```jsx
export default function DashboardPage() {
  return <h1 className="text-xl font-semibold">今日待辦</h1>
}
```

`client/src/App.jsx`:
```jsx
import { Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

`client/src/main.jsx`:
```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { setUnauthorizedHandler } from './services/api.js'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchInterval: 5 * 60 * 1000,
      retry: (failureCount, error) => error?.status >= 500 && failureCount < 2,
    },
  },
})

// Any 401 means the session expired: clearing `me` makes RequireAuth redirect to /login.
setUnauthorizedHandler(() => queryClient.setQueryData(['me'], null))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
```

`client/src/test/render.jsx`:
```jsx
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../components/Toast.jsx'

export function renderWithProviders(ui, { route = '/', path = '/' } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="/patients/:id" element={<p>客人詳細頁</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
```

- [ ] **Step 5: Run to verify tests pass and the app builds**

Run: `npm test -w client && npm run build -w client`
Expected: tests PASS; `client/dist/` produced.

- [ ] **Step 6: Manual smoke check**

Run `npm run dev:server` and `npm run dev:client` in two terminals, open http://localhost:5173, log in with the seeded account. Expected: redirect to the 「今日待辦」 heading with the nav bar; 「登出」 returns to the login page; a wrong password shows 「帳號或密碼錯誤」.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json client
git commit -m "feat(client): scaffold React app with API client, login, layout and toasts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Recall display components

**Files:**
- Create: `client/src/utils/format.js`, `client/src/utils/recallActions.js`
- Create: `client/src/components/ProgressDots.jsx`, `client/src/components/RecallCard.jsx`, `client/src/components/ActionButtons.jsx`
- Create: `client/src/hooks/useRecalls.js`
- Test: `client/src/utils/format.test.js`, `client/src/utils/recallActions.test.js`, `client/src/components/ProgressDots.test.jsx`, `client/src/components/RecallCard.test.jsx`, `client/src/components/ActionButtons.test.jsx`

**Interfaces:**
- Consumes: `RecallItem` from Task 9, labels and `renderWithProviders` from Task 11.
- Produces:
  - `formatPhone(digits)`, `formatMonthDay(date) → 'M/D'`, `formatDate(date) → 'YYYY/MM/DD'`, `formatDateTime(iso)`, `todayLocal()`, `addDaysLocal(date, n)`
  - `allowedActions(recall, hasLine) → ('LINE_SENT'|'CALL_NO_ANSWER'|'CONFIRM')[]`, `PROGRESS_STEPS`
  - `<ProgressDots recall hasLine />`, `<RecallCard item>{footer}</RecallCard>`, `<ActionButtons recall hasLine onAction disabled />`
  - hooks: `invalidateRecallData(queryClient)`, `useToday()`, `useRecallList(list)`, `useRecallAction()`, `useEditRecall()`, `useRestartRecall()`

- [ ] **Step 1: Write the failing tests**

`client/src/utils/format.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { formatPhone, formatMonthDay, formatDate } from './format.js'

describe('format', () => {
  it('formats mobile numbers 4-3-3 and leaves others alone', () => {
    expect(formatPhone('0912345678')).toBe('0912-345-678')
    expect(formatPhone('0223456789')).toBe('0223456789')
  })
  it('formats month/day without leading zeros', () => {
    expect(formatMonthDay('2026-09-06')).toBe('9/6')
    expect(formatMonthDay(null)).toBe('')
  })
  it('formats full dates with slashes', () => {
    expect(formatDate('2026-10-06')).toBe('2026/10/06')
  })
})
```

`client/src/utils/recallActions.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { allowedActions } from './recallActions.js'

const recall = (overrides) => ({ step: 'NOT_CONTACTED', status: 'PENDING', onHold: false, ...overrides })

describe('allowedActions', () => {
  it.each([
    [recall(), true, ['LINE_SENT', 'CONFIRM']],
    [recall(), false, ['CALL_NO_ANSWER', 'CONFIRM']],
    [recall({ step: 'LINE_SENT' }), true, ['CALL_NO_ANSWER', 'CONFIRM']],
    [recall({ step: 'CALLED_2' }), true, ['CALL_NO_ANSWER', 'CONFIRM']],
    [recall({ step: 'CALLED_3' }), true, ['CONFIRM']],
    [recall({ status: 'CONFIRMED' }), true, []],
    [recall({ onHold: true }), true, []],
  ])('%o with LINE=%s → %o', (input, hasLine, expected) => {
    expect(allowedActions(input, hasLine)).toEqual(expected)
  })
})
```

`client/src/components/ProgressDots.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProgressDots from './ProgressDots.jsx'

const recall = { lineSentAt: '2026-09-24', call1At: '2026-09-26', call2At: null, call3At: null }

describe('ProgressDots', () => {
  it('shows each step date on hover and marks done steps', () => {
    render(<ProgressDots recall={recall} hasLine />)
    expect(screen.getByTitle('傳 LINE 9/24')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTitle('第 1 次電話 9/26')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTitle('第 2 次電話 尚未進行')).toHaveAttribute('data-done', 'false')
    expect(screen.getByTitle('第 3 次電話 尚未進行')).toBeInTheDocument()
  })

  it('marks the LINE step as skipped for patients without LINE', () => {
    render(<ProgressDots recall={{ ...recall, lineSentAt: null }} hasLine={false} />)
    expect(screen.getByTitle('未加 LINE')).toBeInTheDocument()
  })
})
```

`client/src/components/ActionButtons.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActionButtons from './ActionButtons.jsx'

describe('ActionButtons', () => {
  it('offers LINE and confirm before any contact', () => {
    render(<ActionButtons recall={{ step: 'NOT_CONTACTED', status: 'PENDING', onHold: false }} hasLine onAction={() => {}} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['已傳 LINE', '確認複診'])
  })

  it('reports the chosen action', () => {
    const onAction = vi.fn()
    render(<ActionButtons recall={{ step: 'CALLED_1', status: 'PENDING', onHold: false }} hasLine onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: '沒接' }))
    expect(onAction).toHaveBeenCalledWith('CALL_NO_ANSWER')
  })

  it('disables every button while a request is in flight', () => {
    render(<ActionButtons recall={{ step: 'LINE_SENT', status: 'PENDING', onHold: false }} hasLine onAction={() => {}} disabled />)
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled())
  })
})
```

`client/src/components/RecallCard.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/render.jsx'
import RecallCard from './RecallCard.jsx'

const base = {
  id: 1, dueDate: '2026-10-09', step: 'CALLED_2', status: 'PENDING', onHold: false, version: 3,
  lineSentAt: '2026-09-24', call1At: '2026-09-26', call2At: '2026-09-28', call3At: null,
  patient: { id: 42, name: '王小明', phoneNumber: '0912345678', hasLine: true },
}

describe('RecallCard', () => {
  it('shows only the essentials: name, phone, next action and an overdue badge', () => {
    const item = { ...base, nextAction: { action: 'CALL_3', actionDate: '2026-09-30', overdueDays: 2 } }
    renderWithProviders(<RecallCard item={item} />)
    expect(screen.getByRole('heading', { name: '王小明' })).toBeInTheDocument()
    expect(screen.getByText('0912-345-678')).toBeInTheDocument()
    expect(screen.getByText('打第 3 次')).toBeInTheDocument()
    expect(screen.getByText('逾期 2 天')).toBeInTheDocument()
    expect(screen.queryByText(/回診日/)).not.toBeInTheDocument()
  })

  it('shows the due date instead when not overdue', () => {
    const item = { ...base, nextAction: { action: 'CALL_3', actionDate: '2026-10-02', overdueDays: 0 } }
    renderWithProviders(<RecallCard item={item} />)
    expect(screen.getByText('回診日 10/9')).toBeInTheDocument()
  })

  it('shows the status when there is no next action', () => {
    renderWithProviders(<RecallCard item={{ ...base, status: 'UNREACHABLE', nextAction: null }} />)
    expect(screen.getByText('聯絡不上')).toBeInTheDocument()
  })

  it('opens the patient when the card is clicked, but not when the footer is', () => {
    const item = { ...base, nextAction: null }
    renderWithProviders(<RecallCard item={item}><button type="button">footer</button></RecallCard>)
    fireEvent.click(screen.getByText('footer'))
    expect(screen.queryByText('客人詳細頁')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: '王小明' }))
    expect(screen.getByText('客人詳細頁')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w client`
Expected: FAIL — cannot find `./format.js`, `./recallActions.js` and the components.

- [ ] **Step 3: Implement**

`client/src/utils/format.js`:
```js
import dayjs from 'dayjs'

export function formatPhone(digits) {
  if (/^09\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  return digits
}

export function formatMonthDay(date) {
  if (!date) return ''
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function formatDate(date) {
  return date ? date.replaceAll('-', '/') : ''
}

export function formatDateTime(iso) {
  return dayjs(iso).format('YYYY/MM/DD HH:mm')
}

// The clinic computer runs in Taipei time, so the browser's local date is the clinic's date.
export function todayLocal() {
  return dayjs().format('YYYY-MM-DD')
}

export function addDaysLocal(date, days) {
  return dayjs(date).add(days, 'day').format('YYYY-MM-DD')
}
```

`client/src/utils/recallActions.js`:
```js
// Mirrors applyAction in server/src/domain/recallRules.js.
const CALLABLE_STEPS = new Set(['LINE_SENT', 'CALLED_1', 'CALLED_2'])

export function allowedActions(recall, hasLine) {
  if (recall.status !== 'PENDING' || recall.onHold) return []
  const actions = []
  if (recall.step === 'NOT_CONTACTED' && hasLine) actions.push('LINE_SENT')
  if (CALLABLE_STEPS.has(recall.step) || (recall.step === 'NOT_CONTACTED' && !hasLine)) actions.push('CALL_NO_ANSWER')
  actions.push('CONFIRM')
  return actions
}

export const PROGRESS_STEPS = [
  { key: 'LINE_SENT', short: 'LINE', field: 'lineSentAt', name: '傳 LINE' },
  { key: 'CALLED_1', short: '1', field: 'call1At', name: '第 1 次電話' },
  { key: 'CALLED_2', short: '2', field: 'call2At', name: '第 2 次電話' },
  { key: 'CALLED_3', short: '3', field: 'call3At', name: '第 3 次電話' },
]
```

`client/src/components/ProgressDots.jsx`:
```jsx
import { PROGRESS_STEPS } from '../utils/recallActions.js'
import { formatMonthDay } from '../utils/format.js'

export default function ProgressDots({ recall, hasLine }) {
  return (
    <ol className="flex items-start" aria-label="聯絡進度">
      {PROGRESS_STEPS.map((step, index) => {
        const date = recall[step.field]
        const skipped = step.key === 'LINE_SENT' && !hasLine
        const title = skipped ? '未加 LINE' : `${step.name} ${date ? formatMonthDay(date) : '尚未進行'}`
        const dotClass = date
          ? 'border-teal-500 bg-teal-500'
          : skipped ? 'border-dashed border-slate-300 bg-white' : 'border-slate-300 bg-white'
        return (
          <li key={step.key} className="flex items-start">
            {index > 0 && <span aria-hidden className={`mt-1.5 h-0.5 w-8 ${date ? 'bg-teal-500' : 'bg-slate-200'}`} />}
            <span className="flex flex-col items-center gap-1">
              <span title={title} data-done={Boolean(date)} className={`h-3.5 w-3.5 rounded-full border-2 ${dotClass}`} />
              <span className="text-xs text-slate-400">{step.short}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
```

`client/src/components/ActionButtons.jsx`:
```jsx
import Button from './Button.jsx'
import { ACTION_LABELS } from '../labels.js'
import { allowedActions } from '../utils/recallActions.js'

const VARIANT = { LINE_SENT: 'secondary', CALL_NO_ANSWER: 'secondary', CONFIRM: 'primary' }

export default function ActionButtons({ recall, hasLine, onAction, disabled = false }) {
  return (
    <>
      {allowedActions(recall, hasLine).map((action) => (
        <Button key={action} variant={VARIANT[action]} disabled={disabled} onClick={() => onAction(action)}>
          {ACTION_LABELS[action]}
        </Button>
      ))}
    </>
  )
}
```

`client/src/components/RecallCard.jsx`:
```jsx
import { useNavigate } from 'react-router'
import ProgressDots from './ProgressDots.jsx'
import { useToast } from './Toast.jsx'
import { NEXT_ACTION_LABELS, STATUS_LABELS } from '../labels.js'
import { formatMonthDay, formatPhone } from '../utils/format.js'

export default function RecallCard({ item, children }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { patient, nextAction } = item
  const overdue = nextAction?.overdueDays > 0

  const copyPhone = (event) => {
    event.stopPropagation()
    navigator.clipboard?.writeText(patient.phoneNumber)
    toast.show({ message: '已複製電話' })
  }

  return (
    <article
      onClick={() => navigate(`/patients/${patient.id}`)}
      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{patient.name}</h3>
          <button type="button" onClick={copyPhone} title="點一下複製" className="mt-1 text-slate-500 hover:text-teal-700">
            {formatPhone(patient.phoneNumber)}
          </button>
        </div>
        {overdue ? (
          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-600">逾期 {nextAction.overdueDays} 天</span>
        ) : (
          <span className="text-sm text-slate-500">回診日 {formatMonthDay(item.dueDate)}</span>
        )}
      </div>

      <div className="mt-5 flex items-center gap-8">
        <ProgressDots recall={item} hasLine={patient.hasLine} />
        <span className="font-medium">{nextAction ? NEXT_ACTION_LABELS[nextAction.action] : STATUS_LABELS[item.status]}</span>
      </div>

      {children && (
        <div className="mt-5 flex justify-end gap-3" onClick={(event) => event.stopPropagation()}>
          {children}
        </div>
      )}
    </article>
  )
}
```

`client/src/hooks/useRecalls.js`:
```js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'
import { useToast } from '../components/Toast.jsx'

export function invalidateRecallData(queryClient) {
  return Promise.all(
    ['today', 'recallList', 'patients', 'patient'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  )
}

export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: () => api.get('/recalls/today') })
}

export function useRecallList(list, options = {}) {
  return useQuery({ queryKey: ['recallList', list], queryFn: () => api.get(`/recalls?list=${list}`), ...options })
}

function useRecallMutation(mutationFn, successMessage) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn,
    onSuccess: () => successMessage && toast.show({ message: successMessage }),
    onError: (error) => toast.show({ message: error.message, tone: 'error' }),
    onSettled: () => invalidateRecallData(queryClient),
  })
}

export function useRecallAction() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const undo = useRecallMutation(
    ({ id, eventId, version }) => api.post(`/recalls/${id}/undo`, { eventId, version }),
    '已復原',
  )
  return useMutation({
    mutationFn: ({ id, action, version }) => api.post(`/recalls/${id}/actions`, { action, version }),
    onSuccess: ({ recall, eventId }) =>
      toast.show({
        message: '已記錄',
        duration: 10_000,
        action: { label: '復原', onClick: () => undo.mutate({ id: recall.id, eventId, version: recall.version }) },
      }),
    onError: (error) => toast.show({ message: error.message, tone: 'error' }),
    onSettled: () => invalidateRecallData(queryClient),
  })
}

export function useEditRecall() {
  return useRecallMutation(({ id, ...body }) => api.patch(`/recalls/${id}`, body), '已儲存')
}

export function useRestartRecall() {
  return useRecallMutation(
    ({ id, dueDate, version }) => api.post(`/recalls/${id}/restart`, { dueDate, version }),
    '已重新開始追蹤',
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "feat(client): add progress dots, recall card, action buttons and recall hooks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Dashboard and 「登記今日看診」

**Files:**
- Create: `client/src/components/Modal.jsx`, `client/src/components/PatientForm.jsx`, `client/src/components/RegisterVisitDialog.jsx`
- Create: `client/src/hooks/usePatients.js`, `client/src/hooks/useDebouncedValue.js`
- Modify: `client/src/pages/DashboardPage.jsx` (replace)
- Test: `client/src/components/PatientForm.test.jsx`

**Interfaces:**
- Consumes: `useToday`, `useRecallAction`, `invalidateRecallData`, `RecallCard`, `ActionButtons`, `Button`, `Field`, `PageMessage`, `useToast`, `formatDate`, `formatPhone`.
- Produces:
  - `<Modal title onClose>`; `<PatientForm initial? submitLabel onSubmit(data, { registerVisit }) pending error registerVisitOption? />` — shows per-field errors from `error.details` and a 「查看這位客人」 link for `PATIENT_DUPLICATE`
  - `<RegisterVisitDialog onClose />`
  - hooks: `usePatients(params, options?)`, `usePatient(id)`, `useCreatePatient()`, `useUpdatePatient()`, `useDeletePatient()`, `useRecordVisit()`, `useDeleteVisit()`, `useDebouncedValue(value, ms)`

- [ ] **Step 1: Write the failing test**

`client/src/components/PatientForm.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/render.jsx'
import PatientForm from './PatientForm.jsx'

describe('PatientForm', () => {
  it('submits trimmed values and the register-visit choice', () => {
    const onSubmit = vi.fn()
    renderWithProviders(<PatientForm submitLabel="儲存" onSubmit={onSubmit} registerVisitOption />)
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '王小明' } })
    fireEvent.change(screen.getByLabelText('生日'), { target: { value: '1990-01-31' } })
    fireEvent.change(screen.getByLabelText('電話'), { target: { value: '0912-345-678' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    expect(onSubmit).toHaveBeenCalledWith(
      { name: '王小明', birthDate: '1990-01-31', phoneNumber: '0912-345-678', hasLine: true, comment: null },
      { registerVisit: true },
    )
  })

  it('shows server field errors next to their fields', () => {
    const error = { code: 'VALIDATION_ERROR', message: '電話格式錯誤', details: [{ field: 'phoneNumber', message: '電話格式錯誤' }] }
    renderWithProviders(<PatientForm submitLabel="儲存" onSubmit={() => {}} error={error} />)
    expect(screen.getByText('電話格式錯誤')).toBeInTheDocument()
  })

  it('links to the existing patient on a duplicate', () => {
    const error = { code: 'PATIENT_DUPLICATE', message: '已有相同姓名與生日的客人', details: { existingPatientId: 7 } }
    renderWithProviders(<PatientForm submitLabel="儲存" onSubmit={() => {}} error={error} />)
    expect(screen.getByText('已有相同姓名與生日的客人')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看這位客人' })).toHaveAttribute('href', '/patients/7')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w client`
Expected: FAIL — cannot find `./PatientForm.jsx`.

- [ ] **Step 3: Implement**

`client/src/hooks/useDebouncedValue.js`:
```js
import { useEffect, useState } from 'react'

export function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
```

`client/src/hooks/usePatients.js`:
```js
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'
import { useToast } from '../components/Toast.jsx'
import { invalidateRecallData } from './useRecalls.js'
import { formatDate } from '../utils/format.js'

function toQueryString(params) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '')
  return new URLSearchParams(entries).toString()
}

export function usePatients(params, options = {}) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => api.get(`/patients?${toQueryString(params)}`),
    placeholderData: keepPreviousData,
    ...options,
  })
}

export function usePatient(id) {
  return useQuery({ queryKey: ['patient', id], queryFn: () => api.get(`/patients/${id}`) })
}

function usePatientMutation(mutationFn, successMessage, { toastErrors = true } = {}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      const message = typeof successMessage === 'function' ? successMessage(data, variables) : successMessage
      if (message) toast.show({ message })
    },
    onError: (error) => toastErrors && toast.show({ message: error.message, tone: 'error' }),
    onSettled: () => invalidateRecallData(queryClient),
  })
}

// Form errors are shown inside the form, so create/update do not also toast them.
export function useCreatePatient() {
  return usePatientMutation(
    (body) => api.post('/patients', body),
    (data, body) => (body.registerVisitToday ? '已新增客人並登記今日看診' : '已新增客人'),
    { toastErrors: false },
  )
}

export function useUpdatePatient() {
  return usePatientMutation(({ id, ...body }) => api.patch(`/patients/${id}`, body), '已儲存', { toastErrors: false })
}

export function useDeletePatient() {
  return usePatientMutation((id) => api.del(`/patients/${id}`), '已刪除客人')
}

export function useRecordVisit() {
  return usePatientMutation(
    ({ patientId, visitDate }) => api.post(`/patients/${patientId}/visits`, visitDate ? { visitDate } : {}),
    (data) => `已登記看診，下次回診日 ${formatDate(data.recall.dueDate)}`,
  )
}

export function useDeleteVisit() {
  return usePatientMutation((visitId) => api.del(`/visits/${visitId}`), '已刪除看診紀錄')
}
```

`client/src/components/Modal.jsx`:
```jsx
import { useEffect } from 'react'

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-6 pt-24"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

`client/src/components/PatientForm.jsx`:
```jsx
import { useState } from 'react'
import { Link } from 'react-router'
import Button from './Button.jsx'
import Field, { inputClass } from './Field.jsx'

const EMPTY = { name: '', birthDate: '', phoneNumber: '', hasLine: true, comment: '' }

export default function PatientForm({ initial = {}, submitLabel, onSubmit, pending = false, error, registerVisitOption = false }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial, comment: initial.comment ?? '' })
  const [registerVisit, setRegisterVisit] = useState(true)

  const fieldErrors = Array.isArray(error?.details) ? error.details : []
  const fieldError = (field) => fieldErrors.find((detail) => detail.field === field)?.message
  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = (event) => {
    event.preventDefault()
    const { name, birthDate, phoneNumber, hasLine, comment } = form
    onSubmit({ name: name.trim(), birthDate, phoneNumber, hasLine, comment: comment.trim() || null }, { registerVisit })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="姓名" error={fieldError('name')}>
          <input className={inputClass} required value={form.name} onChange={update('name')} />
        </Field>
        <Field label="生日" error={fieldError('birthDate')}>
          <input className={inputClass} type="date" required value={form.birthDate} onChange={update('birthDate')} />
        </Field>
        <Field label="電話" error={fieldError('phoneNumber')}>
          <input className={inputClass} required inputMode="tel" value={form.phoneNumber} onChange={update('phoneNumber')} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.hasLine} onChange={update('hasLine')} className="h-4 w-4 accent-teal-600" />
          有加 LINE
        </label>
      </div>
      <Field label="備註" error={fieldError('comment')}>
        <textarea className={inputClass} rows={2} value={form.comment} onChange={update('comment')} />
      </Field>
      {registerVisitOption && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={registerVisit} onChange={(e) => setRegisterVisit(e.target.checked)} className="h-4 w-4 accent-teal-600" />
          同時登記今日看診
        </label>
      )}
      {error && fieldErrors.length === 0 && (
        <p className="text-sm text-red-600">
          {error.message}
          {error.code === 'PATIENT_DUPLICATE' && (
            <Link to={`/patients/${error.details.existingPatientId}`} className="ml-2 underline">查看這位客人</Link>
          )}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? '儲存中…' : submitLabel}</Button>
      </div>
    </form>
  )
}
```

`client/src/components/RegisterVisitDialog.jsx`:
```jsx
import { useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import PatientForm from './PatientForm.jsx'
import { inputClass } from './Field.jsx'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import { useCreatePatient, usePatients, useRecordVisit } from '../hooks/usePatients.js'
import { formatDate, formatPhone } from '../utils/format.js'

function guessInitial(search) {
  const text = search.trim()
  return /^[\d\s-]+$/.test(text) ? { phoneNumber: text } : { name: text }
}

export default function RegisterVisitDialog({ onClose }) {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const term = useDebouncedValue(search.trim(), 300)
  const results = usePatients({ search: term, page: 1 }, { enabled: term.length > 0 })
  const recordVisit = useRecordVisit()
  const createPatient = useCreatePatient()

  if (creating) {
    return (
      <Modal title="新客人" onClose={onClose}>
        <PatientForm
          initial={guessInitial(search)}
          submitLabel="儲存並登記看診"
          pending={createPatient.isPending}
          error={createPatient.error}
          onSubmit={(data) => createPatient.mutate({ ...data, registerVisitToday: true }, { onSuccess: onClose })}
        />
      </Modal>
    )
  }

  const items = term ? results.data?.items ?? [] : []

  return (
    <Modal title="登記今日看診" onClose={onClose}>
      <input
        autoFocus
        className={inputClass}
        placeholder="輸入姓名或電話搜尋"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul className="mt-4 divide-y divide-slate-100">
        {items.map((patient) => (
          <li key={patient.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium">{patient.name}</p>
              <p className="text-sm text-slate-500">{formatPhone(patient.phoneNumber)} · 生日 {formatDate(patient.birthDate)}</p>
            </div>
            <Button
              disabled={recordVisit.isPending}
              onClick={() => recordVisit.mutate({ patientId: patient.id }, { onSuccess: onClose })}
            >
              登記看診
            </Button>
          </li>
        ))}
      </ul>
      {term && results.isSuccess && items.length === 0 && (
        <p className="py-4 text-center text-sm text-slate-500">找不到符合的客人</p>
      )}
      <div className="mt-6 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={() => setCreating(true)}>＋ 新客人</Button>
      </div>
    </Modal>
  )
}
```

`client/src/pages/DashboardPage.jsx`:
```jsx
import { useState } from 'react'
import { Link } from 'react-router'
import Button from '../components/Button.jsx'
import PageMessage from '../components/PageMessage.jsx'
import RecallCard from '../components/RecallCard.jsx'
import ActionButtons from '../components/ActionButtons.jsx'
import RegisterVisitDialog from '../components/RegisterVisitDialog.jsx'
import { useRecallAction, useToday } from '../hooks/useRecalls.js'

const RECALL_LISTS = [
  { key: 'confirmed-no-show', label: '確認但未到' },
  { key: 'import-overdue', label: '匯入時已過期' },
  { key: 'unreachable', label: '聯絡不上' },
]

export default function DashboardPage() {
  const today = useToday()
  const action = useRecallAction()
  const [registering, setRegistering] = useState(false)

  if (today.isPending) return <PageMessage>載入中…</PageMessage>
  if (today.isError) return <PageMessage tone="error">{today.error.message}</PageMessage>

  const { summary, counts, items } = today.data

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-lg">
          今天要聯絡 <strong>{summary.total}</strong> 人
          {summary.overdue > 0 && <span className="font-semibold text-red-600"> · 逾期 {summary.overdue} 人</span>}
        </p>
        <Button onClick={() => setRegistering(true)}>＋ 登記今日看診</Button>
      </section>

      {items.length === 0 ? (
        <PageMessage>今天沒有需要聯絡的客人</PageMessage>
      ) : (
        <div className="space-y-5">
          {items.map((item) => (
            <RecallCard key={item.id} item={item}>
              <ActionButtons
                recall={item}
                hasLine={item.patient.hasLine}
                disabled={action.isPending}
                onAction={(selected) => action.mutate({ id: item.id, action: selected, version: item.version })}
              />
            </RecallCard>
          ))}
        </div>
      )}

      <nav className="flex flex-wrap justify-center gap-8 pt-4 text-sm">
        {RECALL_LISTS.map((list) => (
          <Link key={list.key} to={`/lists/${list.key}`} className="text-slate-500 hover:text-teal-700">
            {list.label} ({counts[list.key]})
          </Link>
        ))}
      </nav>

      {registering && <RegisterVisitDialog onClose={() => setRegistering(false)} />}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w client`
Expected: PASS.

- [ ] **Step 5: Manual check against the running app**

With both dev servers running: register today's visit for a new patient through the dialog, then use the patient detail API (or later pages) — expected toast 「已新增客人並登記今日看診」. Create a patient whose recall is due in 7 days (e.g. via `POST /api/patients/:id/visits` with a back-dated `visitDate` 6 months − 7 days ago) and confirm the card shows 「傳 LINE」, clicking 「已傳 LINE」 shows 「已記錄 · 復原」 and 「復原」 restores the card.

- [ ] **Step 6: Commit**

```bash
git add client
git commit -m "feat(client): add today's to-do dashboard and register-visit dialog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Secondary recall lists

**Files:**
- Create: `client/src/components/RestartControl.jsx`, `client/src/pages/RecallListPage.jsx`, `client/src/hooks/useSettings.js`
- Modify: `client/src/App.jsx`
- Test: `client/src/components/RestartControl.test.jsx`

**Interfaces:**
- Consumes: `useRecallList`, `useRestartRecall`, `RecallCard`, `todayLocal`, `addDaysLocal`.
- Produces: route `/lists/:list`; `<RestartControl defaultDate onRestart(dueDate) disabled />`; `useSettings()` (extended in Task 16).

- [ ] **Step 1: Write the failing test**

`client/src/components/RestartControl.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RestartControl from './RestartControl.jsx'

describe('RestartControl', () => {
  it('asks for a due date, defaulting to the suggestion, then restarts', () => {
    const onRestart = vi.fn()
    render(<RestartControl defaultDate="2026-10-13" onRestart={onRestart} />)
    fireEvent.click(screen.getByRole('button', { name: '重新追蹤' }))
    expect(screen.getByLabelText('新的回診日')).toHaveValue('2026-10-13')
    fireEvent.change(screen.getByLabelText('新的回診日'), { target: { value: '2026-10-20' } })
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    expect(onRestart).toHaveBeenCalledWith('2026-10-20')
  })

  it('can be cancelled', () => {
    render(<RestartControl defaultDate="2026-10-13" onRestart={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '重新追蹤' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole('button', { name: '重新追蹤' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w client`
Expected: FAIL — cannot find `./RestartControl.jsx`.

- [ ] **Step 3: Implement**

`client/src/components/RestartControl.jsx`:
```jsx
import { useState } from 'react'
import Button from './Button.jsx'
import { inputClass } from './Field.jsx'
import { todayLocal } from '../utils/format.js'

export default function RestartControl({ defaultDate, onRestart, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(defaultDate)

  if (!open) {
    return (
      <Button variant="secondary" disabled={disabled} onClick={() => { setDate(defaultDate); setOpen(true) }}>
        重新追蹤
      </Button>
    )
  }

  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onRestart(date)
        setOpen(false)
      }}
    >
      <label htmlFor="restart-due-date" className="text-sm text-slate-600">新的回診日</label>
      <input id="restart-due-date" type="date" required min={todayLocal()} value={date}
        onChange={(event) => setDate(event.target.value)} className={`${inputClass} w-auto`} />
      <Button type="submit" disabled={disabled}>確定</Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
    </form>
  )
}
```

Note: the test's `defaultDate` may be earlier than the real today; `min` only constrains the browser picker, not `fireEvent.change`, so the test is stable.

`client/src/hooks/useSettings.js`:
```js
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api.js'

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') })
}
```

`client/src/pages/RecallListPage.jsx`:
```jsx
import { Link, Navigate, useParams } from 'react-router'
import PageMessage from '../components/PageMessage.jsx'
import RecallCard from '../components/RecallCard.jsx'
import RestartControl from '../components/RestartControl.jsx'
import { useRecallList, useRestartRecall } from '../hooks/useRecalls.js'
import { useSettings } from '../hooks/useSettings.js'
import { addDaysLocal, todayLocal } from '../utils/format.js'

const HINTS = {
  'confirmed-no-show': { title: '確認但未到', hint: '已確認複診，但回診日已過、還沒有新的看診紀錄。' },
  'import-overdue': { title: '匯入時已過期', hint: '匯入時回診日已經過了。按「重新追蹤」設定新的回診日後，就會進入今日待辦。' },
  unreachable: { title: '聯絡不上', hint: '打 3 次都沒接，或客人表示不回診。' },
}

export default function RecallListPage() {
  const { list } = useParams()
  const meta = HINTS[list]
  const query = useRecallList(list, { enabled: Boolean(meta) })
  const settings = useSettings()
  const restart = useRestartRecall()

  if (!meta) return <Navigate to="/" replace />

  const defaultDate = addDaysLocal(todayLocal(), settings.data?.lineLeadDays ?? 7)

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-slate-500 hover:text-teal-700">← 今日待辦</Link>
        <h1 className="mt-3 text-xl font-semibold">{meta.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{meta.hint}</p>
      </div>
      {query.isPending && <PageMessage>載入中…</PageMessage>}
      {query.isError && <PageMessage tone="error">{query.error.message}</PageMessage>}
      {query.isSuccess && query.data.items.length === 0 && <PageMessage>目前沒有資料</PageMessage>}
      {query.isSuccess && (
        <div className="space-y-5">
          {query.data.items.map((item) => (
            <RecallCard key={item.id} item={item}>
              <RestartControl
                defaultDate={defaultDate}
                disabled={restart.isPending}
                onRestart={(dueDate) => restart.mutate({ id: item.id, dueDate, version: item.version })}
              />
            </RecallCard>
          ))}
        </div>
      )}
    </div>
  )
}
```

In `client/src/App.jsx` add `import RecallListPage from './pages/RecallListPage.jsx'` and, inside the protected layout route, `<Route path="lists/:list" element={<RecallListPage />} />`.

- [ ] **Step 4: Run tests**

Run: `npm test -w client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "feat(client): add secondary recall lists with restart" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Patient list and patient detail

**Files:**
- Create: `client/src/utils/describeEvent.js`, `client/src/components/ConfirmDialog.jsx`, `client/src/components/RecallTimeline.jsx`, `client/src/components/RecallEditor.jsx`
- Create: `client/src/pages/PatientsPage.jsx`, `client/src/pages/PatientDetailPage.jsx`
- Modify: `client/src/App.jsx`
- Test: `client/src/utils/describeEvent.test.js`

**Interfaces:**
- Consumes: `usePatients`, `usePatient`, `useCreatePatient`, `useUpdatePatient`, `useDeletePatient`, `useRecordVisit`, `useDeleteVisit`, `useEditRecall`, `PatientForm`, `Modal`, labels, format helpers, `PROGRESS_STEPS`.
- Produces: routes `/patients` and `/patients/:id`; `describeEvent(event) → { title, lines: string[] }`.

- [ ] **Step 1: Write the failing test**

`client/src/utils/describeEvent.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { describeEvent } from './describeEvent.js'

const before = { step: 'LINE_SENT', status: 'PENDING', dueDate: '2026-10-13' }

describe('describeEvent', () => {
  it('names one-click actions by the button the staff pressed', () => {
    const event = { type: 'ACTION', action: 'CALL_NO_ANSWER', note: null, before, after: { ...before, step: 'CALLED_1' } }
    expect(describeEvent(event)).toEqual({ title: '沒接', lines: ['步驟：已傳 LINE → 已撥打 1 次'] })
  })

  it('lists every changed field and the note for manual edits', () => {
    const event = {
      type: 'MANUAL_EDIT', action: null, note: '客人說下個月再約',
      before, after: { ...before, status: 'CONFIRMED', dueDate: '2026-11-02' },
    }
    expect(describeEvent(event)).toEqual({
      title: '手動修改',
      lines: ['狀態：未確認 → 確認複診', '回診日：2026/10/13 → 2026/11/02', '備註：客人說下個月再約'],
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w client`
Expected: FAIL — cannot find `./describeEvent.js`.

- [ ] **Step 3: Implement**

`client/src/utils/describeEvent.js`:
```js
import { ACTION_LABELS, EVENT_TYPE_LABELS, STATUS_LABELS, STEP_LABELS } from '../labels.js'
import { formatDate } from './format.js'

export function describeEvent(event) {
  const title = event.type === 'ACTION' ? ACTION_LABELS[event.action] : EVENT_TYPE_LABELS[event.type]
  const { before, after } = event
  const lines = []
  if (before.step !== after.step) lines.push(`步驟：${STEP_LABELS[before.step]} → ${STEP_LABELS[after.step]}`)
  if (before.status !== after.status) lines.push(`狀態：${STATUS_LABELS[before.status]} → ${STATUS_LABELS[after.status]}`)
  if (before.dueDate !== after.dueDate) lines.push(`回診日：${formatDate(before.dueDate)} → ${formatDate(after.dueDate)}`)
  if (event.note) lines.push(`備註：${event.note}`)
  return { title, lines }
}
```

`client/src/components/ConfirmDialog.jsx`:
```jsx
import Modal from './Modal.jsx'
import Button from './Button.jsx'

export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, pending = false }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-slate-600">{message}</p>
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="ghost" onClick={onCancel}>取消</Button>
        <Button variant="danger" disabled={pending} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
```

`client/src/components/RecallTimeline.jsx`:
```jsx
import { NEXT_ACTION_LABELS } from '../labels.js'
import { PROGRESS_STEPS } from '../utils/recallActions.js'
import { formatDate } from '../utils/format.js'

export default function RecallTimeline({ recall, hasLine }) {
  const rows = [
    { label: '回診日', value: formatDate(recall.dueDate), done: true },
    ...PROGRESS_STEPS.map((step) => {
      const date = recall[step.field]
      const skipped = step.key === 'LINE_SENT' && !hasLine
      return { label: step.name, value: skipped ? '未加 LINE' : date ? formatDate(date) : '尚未進行', done: Boolean(date) }
    }),
  ]
  if (recall.confirmedAt) rows.push({ label: '確認複診', value: formatDate(recall.confirmedAt), done: true })

  return (
    <div>
      <ol className="space-y-3 border-l-2 border-slate-100 pl-5">
        {rows.map((row) => (
          <li key={row.label} className="relative">
            <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ${row.done ? 'bg-teal-500' : 'border-2 border-slate-300 bg-white'}`} />
            <span className="text-sm text-slate-500">{row.label}</span>
            <span className="ml-3">{row.value}</span>
          </li>
        ))}
      </ol>
      {recall.nextAction && (
        <p className="mt-4 text-sm font-medium text-teal-700">
          下一步：{NEXT_ACTION_LABELS[recall.nextAction.action]}（{formatDate(recall.nextAction.actionDate)}）
        </p>
      )}
    </div>
  )
}
```

`client/src/components/RecallEditor.jsx`:
```jsx
import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import Field, { inputClass } from './Field.jsx'
import { STATUS_LABELS, STEP_LABELS } from '../labels.js'
import { useEditRecall } from '../hooks/useRecalls.js'

const EDITABLE_STATUSES = ['PENDING', 'CONFIRMED', 'UNREACHABLE']

function initialForm(recall) {
  return { step: recall.step, status: recall.status, dueDate: recall.dueDate, note: '' }
}

export default function RecallEditor({ recall }) {
  const edit = useEditRecall()
  const [form, setForm] = useState(initialForm(recall))

  useEffect(() => setForm(initialForm(recall)), [recall])

  const changes = {}
  if (form.step !== recall.step) changes.step = form.step
  if (form.status !== recall.status) changes.status = form.status
  if (form.dueDate !== recall.dueDate) changes.dueDate = form.dueDate
  const dirty = Object.keys(changes).length > 0

  const submit = (event) => {
    event.preventDefault()
    edit.mutate({ id: recall.id, ...changes, note: form.note.trim() || undefined, version: recall.version })
  }

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="步驟">
          <select className={inputClass} value={form.step} onChange={update('step')}>
            {Object.entries(STEP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="狀態">
          <select className={inputClass} value={form.status} onChange={update('status')}>
            {EDITABLE_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select>
        </Field>
        <Field label="回診日">
          <input className={inputClass} type="date" required value={form.dueDate} onChange={update('dueDate')} />
        </Field>
      </div>
      <Field label="備註（選填）">
        <input className={inputClass} value={form.note} onChange={update('note')} placeholder="例：客人說下個月再約" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={!dirty || edit.isPending}>儲存變更</Button>
      </div>
    </form>
  )
}
```

`client/src/pages/PatientsPage.jsx`:
```jsx
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import Button from '../components/Button.jsx'
import Modal from '../components/Modal.jsx'
import PageMessage from '../components/PageMessage.jsx'
import PatientForm from '../components/PatientForm.jsx'
import { inputClass } from '../components/Field.jsx'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import { useCreatePatient, usePatients } from '../hooks/usePatients.js'
import { STATUS_LABELS, STEP_LABELS } from '../labels.js'
import { formatDate, formatPhone } from '../utils/format.js'

const STATUS_FILTERS = [['', '全部狀態'], ['PENDING', '未確認'], ['CONFIRMED', '確認複診'], ['UNREACHABLE', '聯絡不上']]

export default function PatientsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const term = useDebouncedValue(search.trim(), 300)
  const query = usePatients({ search: term, status, page })
  const createPatient = useCreatePatient()

  useEffect(() => setPage(1), [term, status])

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold">客人</h1>
        <input className={`${inputClass} max-w-xs`} placeholder="姓名、電話或生日" value={search}
          onChange={(event) => setSearch(event.target.value)} />
        <select className={`${inputClass} w-auto`} value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button className="ml-auto" onClick={() => setCreating(true)}>＋ 新增客人</Button>
      </div>

      {query.isPending && <PageMessage>載入中…</PageMessage>}
      {query.isError && <PageMessage tone="error">{query.error.message}</PageMessage>}
      {query.isSuccess && query.data.items.length === 0 && <PageMessage>沒有符合的客人</PageMessage>}

      {query.isSuccess && query.data.items.length > 0 && (
        <ul className="space-y-3">
          {query.data.items.map((patient) => (
            <li key={patient.id}>
              <Link to={`/patients/${patient.id}`}
                className="flex items-center justify-between gap-6 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm transition hover:shadow-md">
                <div>
                  <p className="font-semibold">{patient.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{formatPhone(patient.phoneNumber)} · 生日 {formatDate(patient.birthDate)}</p>
                </div>
                {patient.currentRecall ? (
                  <div className="text-right text-sm">
                    <p className="font-medium">{STATUS_LABELS[patient.currentRecall.status]}</p>
                    <p className="mt-1 text-slate-500">
                      回診日 {formatDate(patient.currentRecall.dueDate)} · {STEP_LABELS[patient.currentRecall.step]}
                    </p>
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">尚無回診追蹤</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</Button>
          <span className="text-slate-500">第 {page} / {totalPages} 頁</span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一頁</Button>
        </div>
      )}

      {creating && (
        <Modal title="新增客人" onClose={() => setCreating(false)}>
          <PatientForm
            submitLabel="儲存"
            registerVisitOption
            pending={createPatient.isPending}
            error={createPatient.error}
            onSubmit={(data, { registerVisit }) =>
              createPatient.mutate({ ...data, registerVisitToday: registerVisit }, {
                onSuccess: (patient) => navigate(`/patients/${patient.id}`),
              })}
          />
        </Modal>
      )}
    </div>
  )
}
```

`client/src/pages/PatientDetailPage.jsx`:
```jsx
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Button from '../components/Button.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import PageMessage from '../components/PageMessage.jsx'
import PatientForm from '../components/PatientForm.jsx'
import RecallEditor from '../components/RecallEditor.jsx'
import RecallTimeline from '../components/RecallTimeline.jsx'
import { useDeletePatient, useDeleteVisit, usePatient, useRecordVisit, useUpdatePatient } from '../hooks/usePatients.js'
import { describeEvent } from '../utils/describeEvent.js'
import { formatDate, formatDateTime } from '../utils/format.js'

function Section({ title, action, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function PatientDetailPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const query = usePatient(id)
  const updatePatient = useUpdatePatient()
  const deletePatient = useDeletePatient()
  const recordVisit = useRecordVisit()
  const deleteVisit = useDeleteVisit()
  const [confirming, setConfirming] = useState(null) // 'patient' | visit object

  if (query.isPending) return <PageMessage>載入中…</PageMessage>
  if (query.isError) return <PageMessage tone="error">{query.error.message}</PageMessage>

  const patient = query.data
  const recall = patient.currentRecall
  const latestVisit = patient.visits[0]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/patients" className="text-sm text-slate-500 hover:text-teal-700">← 客人</Link>
          <h1 className="mt-3 text-2xl font-semibold">{patient.name}</h1>
        </div>
        <Button variant="ghost" onClick={() => setConfirming('patient')}>刪除客人</Button>
      </div>

      <Section
        title="目前回診追蹤"
        action={<Button disabled={recordVisit.isPending} onClick={() => recordVisit.mutate({ patientId: id })}>登記今日看診</Button>}
      >
        {recall ? (
          <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
            <RecallTimeline recall={recall} hasLine={patient.hasLine} />
            <RecallEditor recall={recall} />
          </div>
        ) : (
          <p className="text-slate-500">尚無回診追蹤，登記看診後會自動建立。</p>
        )}
      </Section>

      <Section title="基本資料">
        <PatientForm
          key={patient.updatedAt}
          initial={patient}
          submitLabel="儲存"
          pending={updatePatient.isPending}
          error={updatePatient.error}
          onSubmit={(data) => updatePatient.mutate({ id, ...data })}
        />
      </Section>

      <Section title="看診紀錄">
        {patient.visits.length === 0 ? (
          <p className="text-slate-500">尚無看診紀錄</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {patient.visits.map((visit) => (
              <li key={visit.id} className="flex items-center justify-between py-3">
                <span>{formatDate(visit.visitDate)}{visit.note && <span className="ml-3 text-sm text-slate-500">{visit.note}</span>}</span>
                {visit.id === latestVisit.id && (
                  <Button variant="ghost" onClick={() => setConfirming(visit)}>刪除</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <details className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <summary className="cursor-pointer font-semibold">修改紀錄（{patient.events.length}）</summary>
        <ul className="mt-5 space-y-4">
          {patient.events.map((event) => {
            const { title, lines } = describeEvent(event)
            return (
              <li key={event.id} className="text-sm">
                <p><span className="font-medium">{title}</span><span className="ml-3 text-slate-400">{formatDateTime(event.createdAt)}</span></p>
                {lines.map((line) => <p key={line} className="mt-1 text-slate-600">{line}</p>)}
              </li>
            )
          })}
        </ul>
      </details>

      {confirming === 'patient' && (
        <ConfirmDialog
          title="刪除客人"
          message={`確定要刪除「${patient.name}」嗎？所有看診與回診追蹤紀錄都會一起刪除，無法復原。`}
          confirmLabel="刪除"
          pending={deletePatient.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => deletePatient.mutate(id, { onSuccess: () => navigate('/patients') })}
        />
      )}
      {confirming && confirming !== 'patient' && (
        <ConfirmDialog
          title="刪除看診紀錄"
          message={`確定要刪除 ${formatDate(confirming.visitDate)} 的看診紀錄嗎？這次看診產生的回診追蹤會一起刪除，上一筆追蹤會恢復原狀。`}
          confirmLabel="刪除"
          pending={deleteVisit.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => deleteVisit.mutate(confirming.id, { onSuccess: () => setConfirming(null) })}
        />
      )}
    </div>
  )
}
```

In `client/src/App.jsx` add `import PatientsPage from './pages/PatientsPage.jsx'` and `import PatientDetailPage from './pages/PatientDetailPage.jsx'`, and inside the protected layout route:
```jsx
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:id" element={<PatientDetailPage />} />
```

- [ ] **Step 4: Run tests**

Run: `npm test -w client`
Expected: PASS.

- [ ] **Step 5: Manual check**

With both dev servers running: search a patient by phone with dashes; open the detail page; change the step to 「已撥打 2 次」 with a note and save — the timeline shows today's date for the filled steps and 「修改紀錄」 lists the change with the note; delete the latest visit and confirm the previous recall comes back.

- [ ] **Step 6: Commit**

```bash
git add client
git commit -m "feat(client): add patient list and patient detail with recall editor and history" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Import and settings pages

**Files:**
- Create: `client/src/hooks/useImport.js`, `client/src/pages/ImportPage.jsx`, `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/hooks/useSettings.js`, `client/src/App.jsx`

**Interfaces:**
- Consumes: import API (Task 10), settings API (Task 6), `useChangePassword` (Task 11), `invalidateRecallData`.
- Produces: routes `/import`, `/settings`; `usePreviewImport()`, `useCommitImport()`, `useUpdateSettings()`.

- [ ] **Step 1: Implement the hooks**

`client/src/hooks/useImport.js`:
```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'
import { invalidateRecallData } from './useRecalls.js'

export function usePreviewImport() {
  return useMutation({
    mutationFn: (file) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.upload('/imports/preview', formData)
    },
  })
}

export function useCommitImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rows) => api.post('/imports/commit', { rows }),
    onSuccess: () => invalidateRecallData(queryClient),
  })
}
```

Replace `client/src/hooks/useSettings.js` with:
```js
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'
import { useToast } from '../components/Toast.jsx'
import { invalidateRecallData } from './useRecalls.js'

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (changes) => api.patch('/settings', changes),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data)
      toast.show({ message: '設定已儲存' })
      invalidateRecallData(queryClient)
    },
  })
}
```

- [ ] **Step 2: Implement the pages**

`client/src/pages/ImportPage.jsx`:
```jsx
import { useState } from 'react'
import { Link } from 'react-router'
import Button from '../components/Button.jsx'
import { useCommitImport, usePreviewImport } from '../hooks/useImport.js'
import { formatDate } from '../utils/format.js'

function Step({ number, title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold"><span className="mr-2 text-teal-600">{number}</span>{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function ImportPage() {
  const preview = usePreviewImport()
  const commit = useCommitImport()
  const [fileName, setFileName] = useState('')

  const data = preview.data
  const validRows = data?.rows.filter((row) => row.status === 'valid') ?? []
  const errorRows = data?.rows.filter((row) => row.status === 'error') ?? []
  const duplicateRows = data?.rows.filter((row) => row.status.startsWith('duplicate')) ?? []

  const onFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileName(file.name)
    commit.reset()
    preview.mutate(file)
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">匯入客人資料</h1>

      <Step number="1" title="下載範本">
        <p className="text-sm text-slate-600">範本有「姓名、生日、電話、上次看診日、有加 LINE、備註」六欄。日期可以寫 1990-01-31、1990/1/31 或民國 79/1/31。</p>
        <a href="/api/imports/template" download className="mt-4 inline-block text-sm font-medium text-teal-700 underline">下載範本 Excel</a>
      </Step>

      <Step number="2" title="上傳填好的檔案">
        <label className="inline-flex cursor-pointer items-center gap-3">
          <span className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">選擇檔案</span>
          <span className="text-sm text-slate-500">{fileName || '尚未選擇'}</span>
          <input type="file" accept=".xlsx" className="hidden" onChange={onFile} />
        </label>
        {preview.isPending && <p className="mt-4 text-sm text-slate-500">讀取中…</p>}
        {preview.error && <p className="mt-4 text-sm text-red-600">{preview.error.message}</p>}
      </Step>

      {data && !commit.isSuccess && (
        <Step number="3" title="確認預覽">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-teal-50 px-3 py-1 text-teal-700">可匯入 {data.summary.valid} 筆（其中 {data.summary.onHold} 筆已過期）</span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-600">有錯誤 {data.summary.error} 筆</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">重複 {data.summary.duplicate} 筆（不會匯入）</span>
          </div>

          {errorRows.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-medium text-red-600">以下資料有錯誤，請修正 Excel 後重新上傳，或直接匯入其他正確的資料：</p>
              <ul className="mt-3 space-y-2 text-sm">
                {errorRows.map((row) => (
                  <li key={row.rowNumber}>
                    第 {row.rowNumber} 列{row.raw.name && `（${row.raw.name}）`}：
                    {row.errors.map((error) => `${error.column}${error.message}`).join('、')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {duplicateRows.length > 0 && (
            <details className="mt-6 text-sm">
              <summary className="cursor-pointer text-slate-600">查看重複的資料（{duplicateRows.length}）</summary>
              <ul className="mt-3 space-y-1 text-slate-500">
                {duplicateRows.map((row) => (
                  <li key={row.rowNumber}>
                    第 {row.rowNumber} 列 {row.data.name}（{formatDate(row.data.birthDate)}）—
                    {row.status === 'duplicate-existing' ? '系統中已有這位客人' : '檔案中重複出現'}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {commit.error && <p className="mt-6 text-sm text-red-600">{commit.error.message}</p>}
          <div className="mt-6 flex justify-end">
            <Button disabled={validRows.length === 0 || commit.isPending}
              onClick={() => commit.mutate(validRows.map((row) => row.data))}>
              {commit.isPending ? '匯入中…' : `確認匯入 ${validRows.length} 筆`}
            </Button>
          </div>
        </Step>
      )}

      {commit.isSuccess && (
        <Step number="✓" title="匯入完成">
          <p>已匯入 {commit.data.imported} 筆。</p>
          {commit.data.onHold > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              其中 {commit.data.onHold} 筆回診日已過，放在
              <Link to="/lists/import-overdue" className="mx-1 text-teal-700 underline">匯入時已過期</Link>
              清單，有空時再逐一重新追蹤。
            </p>
          )}
        </Step>
      )}
    </div>
  )
}
```

`client/src/pages/SettingsPage.jsx`:
```jsx
import { useEffect, useState } from 'react'
import Button from '../components/Button.jsx'
import Field, { inputClass } from '../components/Field.jsx'
import PageMessage from '../components/PageMessage.jsx'
import { useToast } from '../components/Toast.jsx'
import { useChangePassword } from '../hooks/useAuth.js'
import { useSettings, useUpdateSettings } from '../hooks/useSettings.js'

const FIELDS = [
  { key: 'recallIntervalMonths', label: '回診間隔（個月）', min: 1, max: 24, hint: '看診日往後推幾個月為下次回診日，只影響之後登記的看診' },
  { key: 'lineLeadDays', label: '提前傳 LINE（天）', min: 1, max: 30, hint: '回診日前幾天傳 LINE 提醒' },
  { key: 'callAfterLineDays', label: '傳 LINE 後打電話（天）', min: 1, max: 14, hint: '傳 LINE 後幾天沒確認就打電話' },
  { key: 'callGapDays', label: '電話間隔（天）', min: 1, max: 14, hint: '電話沒接後隔幾天再打' },
]

function fieldError(error, field) {
  return Array.isArray(error?.details) ? error.details.find((d) => d.field === field)?.message : undefined
}

function RecallSettingsForm({ settings }) {
  const update = useUpdateSettings()
  const [form, setForm] = useState(settings)
  useEffect(() => setForm(settings), [settings])

  const changes = Object.fromEntries(
    FIELDS.filter(({ key }) => Number(form[key]) !== settings[key]).map(({ key }) => [key, Number(form[key])]),
  )

  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); update.mutate(changes) }}>
      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map(({ key, label, min, max, hint }) => (
          <Field key={key} label={label} hint={hint} error={fieldError(update.error, key)}>
            <input className={inputClass} type="number" min={min} max={max} required value={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
          </Field>
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={Object.keys(changes).length === 0 || update.isPending}>儲存設定</Button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const changePassword = useChangePassword()
  const toast = useToast()
  const empty = { currentPassword: '', newPassword: '', confirmPassword: '' }
  const [form, setForm] = useState(empty)
  const mismatch = form.confirmPassword !== '' && form.newPassword !== form.confirmPassword

  const submit = (event) => {
    event.preventDefault()
    if (mismatch) return
    changePassword.mutate(
      { currentPassword: form.currentPassword, newPassword: form.newPassword },
      { onSuccess: () => { setForm(empty); toast.show({ message: '密碼已更新' }) } },
    )
  }
  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="目前密碼">
          <input className={inputClass} type="password" autoComplete="current-password" required value={form.currentPassword} onChange={update('currentPassword')} />
        </Field>
        <Field label="新密碼" hint="至少 8 個字元">
          <input className={inputClass} type="password" autoComplete="new-password" required value={form.newPassword} onChange={update('newPassword')} />
        </Field>
        <Field label="再輸入一次新密碼" error={mismatch ? '兩次輸入的新密碼不一致' : undefined}>
          <input className={inputClass} type="password" autoComplete="new-password" required value={form.confirmPassword} onChange={update('confirmPassword')} />
        </Field>
      </div>
      {changePassword.error && <p className="text-sm text-red-600">{changePassword.error.message}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={mismatch || changePassword.isPending}>更新密碼</Button>
      </div>
    </form>
  )
}

export default function SettingsPage() {
  const settings = useSettings()
  if (settings.isPending) return <PageMessage>載入中…</PageMessage>
  if (settings.isError) return <PageMessage tone="error">{settings.error.message}</PageMessage>

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">設定</h1>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 font-semibold">回診提醒</h2>
        <RecallSettingsForm settings={settings.data} />
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 font-semibold">修改登入密碼</h2>
        <PasswordForm />
      </section>
    </div>
  )
}
```

In `client/src/App.jsx` add `import ImportPage from './pages/ImportPage.jsx'` and `import SettingsPage from './pages/SettingsPage.jsx'`, and inside the protected layout route:
```jsx
        <Route path="import" element={<ImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
```

- [ ] **Step 3: Run tests and build**

Run: `npm test -w client && npm run build -w client`
Expected: PASS; build succeeds.

- [ ] **Step 4: Manual check**

With both dev servers running: download the template, fill three rows (one with a phone typed as a number, one with a ROC birth date, one with a last visit date over 6 months ago), upload, confirm the preview counts, import, and confirm the old one appears under 「匯入時已過期」. On 設定, change 電話間隔 to 3 and confirm a recall at 「已撥打 1 次」 now shows its next call one day later; change the password and log in again.

- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "feat(client): add Excel import and settings pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Phase 3 — Production

### Task 17: Single-service production build

**Files:**
- Modify: `server/src/app.js`, `package.json` (root), `CLAUDE.md`
- Test: `server/tests/unit/app.test.js` (append)

**Interfaces:**
- Produces: `createApp({ clientDist? })` serves the built client with an SPA fallback; root `npm run build` and `npm start`.

- [ ] **Step 1: Write the failing test**

Append to `server/tests/unit/app.test.js` (add `import fs from 'node:fs'`, `import os from 'node:os'`, `import path from 'node:path'` at the top):
```js
describe('serving the client', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-dist-'))
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>回診追蹤系統</title>')

  it('serves index.html for client routes', async () => {
    const res = await request(createApp({ clientDist: dist })).get('/patients/12')
    expect(res.status).toBe(200)
    expect(res.text).toContain('回診追蹤系統')
  })

  it('still answers unknown API routes with JSON', async () => {
    const res = await request(createApp({ clientDist: dist })).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -w server`
Expected: FAIL — `/patients/12` returns 404 (no static serving yet).

- [ ] **Step 3: Implement**

Replace `server/src/app.js` with:
```js
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
import { requestLogger } from './middleware/requestLogger.middleware.js'
import { errorHandler } from './middleware/error.middleware.js'
import { NotFoundError } from './errors/AppError.js'
import { apiRouter } from './routes/index.js'

const DEFAULT_CLIENT_DIST = path.resolve(import.meta.dirname, '../../client/dist')

export function createApp({ clientDist = DEFAULT_CLIENT_DIST } = {}) {
  const app = express()
  app.set('trust proxy', 1)
  app.use(requestLogger)
  app.use(express.json({ limit: '5mb' }))
  app.use(cookieParser())
  app.use('/api', apiRouter())
  app.use('/api', (req, res, next) => next(new NotFoundError('ROUTE_NOT_FOUND', '找不到此 API')))

  const indexHtml = path.join(clientDist, 'index.html')
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(clientDist, { index: false, maxAge: '7d' }))
    app.get('/{*splat}', (req, res) => {
      res.set('Cache-Control', 'no-cache')
      res.sendFile(indexHtml)
    })
  }

  app.use(errorHandler)
  return app
}
```

Root `package.json` scripts become:
```json
  "scripts": {
    "dev:server": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "build": "npm run build -w client && npm run prisma:generate -w server",
    "start": "npm run start -w server",
    "test": "npm test -w server && npm test -w client"
  }
```

- [ ] **Step 4: Run the full suite and a production smoke test**

Run: `npm test`
Expected: PASS (server unit + integration, client).

Run: `npm run build`, then `npm start` (uses `server/.env`; applies migrations, then listens on 3000). In another terminal:
```bash
curl -s http://localhost:3000/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/patients
```
Expected: `{"success":true,"data":{"status":"ok"}}` and `200`. Open http://localhost:3000, log in, and click through 今日待辦 / 客人 / 匯入 / 設定. Stop the server.

- [ ] **Step 5: Update CLAUDE.md**

Replace the `## Project status` section of `CLAUDE.md` with:
```markdown
## Project status

v1 implemented per [the design spec](docs/superpowers/specs/2026-10-06-dental-recall-system-design.md) and [plan](docs/superpowers/plans/2026-10-06-dental-recall-system.md). The decisions below override [SPEC.md](SPEC.md) where they conflict.

## Commands (run from the repo root)

- First-time setup: `npm install`; copy `server/.env.example` → `server/.env` and `server/.env.test.example` → `server/.env.test` (test DB name must contain `test`); `npm run db:migrate -w server`; `npm run db:seed -w server`
- Dev: `npm run dev:server` (API on :3000) and `npm run dev:client` (Vite on :5173, proxies `/api`)
- All tests: `npm test` · server unit only: `npm run test:unit -w server` · server integration (resets the test DB): `npm run test:integration -w server` · client: `npm test -w client`
- One test: `cd server && npx vitest run tests/unit/recallRules.test.js -t "counts call 1"` (same pattern in `client/`)
- New migration after editing `server/prisma/schema.prisma`: `npm run db:migrate -w server -- --name <name>`
- Production: `npm run build && npm start` (start runs `prisma migrate deploy` first)
- Forgotten password: `npm run reset-password -w server -- <new-password>` against the target database (on Railway: `railway run npm run reset-password -w server -- <new-password>`)

## Deployment (Railway)

One service from the repo root: build `npm run build`, start `npm start`, health check `/api/health`, restart on failure. Add a Railway MySQL and set `DATABASE_URL` (the MySQL service's URL), `JWT_SECRET` (32+ random chars) and `NODE_ENV=production`; run `railway run npm run db:seed -w server` once with `ADMIN_USERNAME`/`ADMIN_PASSWORD` set.
```

- [ ] **Step 6: Commit**

```bash
git add server/src/app.js server/tests/unit/app.test.js package.json CLAUDE.md
git commit -m "feat: serve the built client from Express and document commands and deployment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
