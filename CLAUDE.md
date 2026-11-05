# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

v1 implemented per [the design spec](docs/superpowers/specs/2026-10-06-dental-recall-system-design.md) and [plan](docs/superpowers/plans/2026-10-06-dental-recall-system.md). The decisions below override [SPEC.md](SPEC.md) where they conflict.

## Commands (run from the repo root)

- First-time setup: `npm install`; copy `server/.env.example` → `server/.env` and `server/.env.test.example` → `server/.env.test` (test DB name must contain `test`); `npm run db:migrate -w server`; `npm run db:seed -w server`
- Dev: `npm run dev:server` (API on :3000) and `npm run dev:client` (Vite on :5173, proxies `/api`)
- All tests: `npm test` · server unit only: `npm run test:unit -w server` · server integration: `npm run test:integration -w server` (runs `prisma migrate deploy` on the test DB, then each test empties the tables) · client: `npm test -w client`
- One test: `cd server && npx vitest run tests/unit/recallRules.test.js -t "counts call 1"` (same pattern in `client/`)
- New migration after editing `server/prisma/schema.prisma`: `npm run db:migrate -w server -- --name <name>`
- Self-hosted production (not used on Vercel): `npm run build && npm start` (start runs `prisma migrate deploy` first)
- Demo data for local testing: `npm run db:seed-demo -w server` (16 fake patients tagged 「【測試資料】」 in their note, dates relative to today; re-running replaces only those; refuses when `NODE_ENV=production`)
- Forgotten password: `npm run reset-password -w server -- <new-password>` against the target database (production: `cd server && node --env-file=.env.production src/scripts/reset-password.js <new-password>`, see Deployment)

## Deployment (Vercel + TiDB Cloud)

Live at https://recall-system-rose.vercel.app. Vercel project `recall-system` (Hobby plan, git-connected: every push to `main` deploys to production, other branches get preview deployments). Database is TiDB Cloud Starter (free, MySQL-compatible), instance `recall-system` in AWS Tokyo; database `recall`.

- `api/index.js` exports `createApp({ clientDist: null })` as one serverless function in `hnd1`; `vercel.json` rewrites `/api/*` to it and everything else to `index.html`. Vercel serves `client/dist` statically. `server/src/server.js` is only for local/self-hosted runs.
- Production builds run `prisma migrate deploy` (guarded by `VERCEL_ENV=production`), so new migrations ship by merging to `main`.
- Vercel env (Production only): `DATABASE_URL` (TiDB URL ending `/recall?sslaccept=strict`) and `JWT_SECRET`. Do not set `NODE_ENV` there: it makes the build skip devDependencies (Vite). Vercel functions already run with `NODE_ENV=production`.
- Running scripts against production: `server/.env.production` (gitignored, local only) holds the TiDB `DATABASE_URL` plus a placeholder `JWT_SECRET`. `vercel env pull` can't recreate it, because the Vercel vars are sensitive and only pull as placeholders; get the URL from TiDB Cloud → Connect. Then `cd server && node --env-file=.env.production src/scripts/<script>.js` (admin: `ADMIN_USERNAME`/`ADMIN_PASSWORD` env + `seed.js`). That file does not set `NODE_ENV`, so never run `seed-demo.js` with it.
- Prisma `binaryTargets` includes `rhel-openssl-3.0.x` for the Vercel runtime. The Excel upload must stay under Vercel's 4.5 MB request limit.

Name ordering uses `zh-Hant-TW` collation, which sorts by stroke count (乙 before 甲).

## What this is

An internal recall (回診追蹤) system for a small dental clinic, used by 2–3 reception staff. It replaces a paper process: after each visit the patient's next recall date is set, and staff must LINE-message then phone patients before that date. The system's job is to tell staff **who to contact today, how many times they've already been contacted, and who is most urgent**. Staff still send LINE messages and make calls by hand, then record them in the system.

**All user-facing text (UI labels, validation messages, error messages shown to users) must be Traditional Chinese (繁體中文, zh-TW).** Code identifiers, enum values, API error `code`s and comments stay in English.

## Decisions that supersede SPEC.md

- **No appointment booking.** The clinic does not book time slots in this system. SPEC.md's `Appointment` (startDate/endDate) is replaced by `Visit` (a past visit) and `Recall` (one follow-up cycle toward a due date).
- **Patient has no status.** Status lives on `Recall`. A patient has at most one current recall — any status except `已回診`.
- **Recall due date** = visit date + N months. N is a clinic-wide setting (default 6); an individual recall's due date can be edited.
- **Recall workflow** (all offsets are settings; defaults shown):
  - Step `尚未聯絡` → send LINE at due date − 7 days (patients without LINE skip straight to call 1 at due date − 7)
  - Step `已傳 LINE` → call 1 at LINE-sent date + 3 days
  - Step `已撥打 1 次` → call 2 at call-1 date + 2 days
  - Step `已撥打 2 次` → call 3 at call-2 date + 2 days
  - Recording call 3 sets status to `聯絡不上` automatically.
  - Offsets are computed from the **actual** date the previous step was recorded, not the planned date.
- **Recall statuses** (exactly four): `未確認` (default, in progress) · `確認複診` · `聯絡不上` (also used manually when a patient declines) · `已回診` (patient came back; a new recall cycle starts).
- Staff can manually change both step and status; every change is recorded in a history/event table.
- **Today's to-do list is computed on read** from step + dates — no cron jobs or background workers. Urgency order = the 倒數 (countdown): earliest due date first (overdue ones on top); ties go to the later contact step (call 3 > call 2 > call 1 > LINE), then name.
- The dashboard has five tabs: 待辦 (today's to-do), 等待回覆 (contacted, next step not yet due), 已確認 (all `確認複診`; past-due ones — 確認但未到 — sort first with a red 逾期 badge), 無法聯絡, 待重新追蹤 (imports held because they were past due).
- **改約 (reschedule)** reuses the restart endpoint: any recall except `已回診` can get a new due date, and its reminders start over from 傳 LINE. The event note records 「改約至 YYYY/MM/DD」.
- **Notifications are in-app only** (dashboard summary + red highlighting), no desktop/push notifications.
- **LINE is manual for v1.** Staff send from the clinic's LINE and click "已傳 LINE". Keep LINE code isolated in its own module so a later LINE Messaging API integration doesn't touch the core.
- **Excel import** of existing paper records (姓名, 生日, 電話, 上次看診日, 備註): preview-then-commit, duplicates detected by name + birth date, and recalls already past due on import go to the 待重新追蹤 tab instead of flooding today's to-do.
- **Deployment:** one Vercel project serves both the built React app (static) and the Express API (one serverless function), with TiDB Cloud Starter as the MySQL database (chosen 2026-11-05 to avoid hosting fees; Vercel Hobby is officially non-commercial, so move to Vercel Pro or Railway if that becomes a problem). Express can still serve the client itself via `npm start` for self-hosting. Not the Vercel + Render split in SPEC.md.
- **"Today"** is always calculated in `Asia/Taipei`. Visit and recall dates are date-only values.

## Architecture

Stack per SPEC.md: React + Vite (JavaScript) frontend, Node.js + Express (JavaScript) backend, Prisma + MySQL, JWT auth with bcrypt.

### Backend layering (strict)

Requests flow **route → controller → service → Prisma**. Never skip a layer or reach upward.

- **routes/** — wire HTTP method + path to middleware (auth, request validation) and a controller function. No logic.
- **controllers/** — read `req` (params/query/body/user), call one service function, send the `{ success: true, data }` response with the right status code. No Prisma, no business rules.
- **services/** — all business logic and all Prisma access. Take plain arguments and return plain data; never see `req`/`res`. Throw typed application errors (e.g. not-found, validation, conflict) instead of building HTTP responses. Multi-record writes (e.g. recording a visit closes the old recall and opens a new one) go in `prisma.$transaction`.
- **validators/** — request schemas, applied by validation middleware before the controller runs.
- **middleware/error.middleware.js** — the single place that maps thrown errors to `{ success: false, error: { code, message } }` and HTTP status codes, and logs unexpected errors. Never return 200 for a failed operation.
- The recall rule logic (next action, action date, overdue days, urgency sort) should be **pure functions with no DB access**, so it can be unit-tested with fixed dates; services load data, call these functions, and persist results.

### Frontend layout principle

Follows the table mockup the user supplied (2026-10-08), which replaced the earlier spaced-card design. Header: clinic name 「微笑牙醫診所」, tabs 今日待辦 (with count) and 病患清單, ⚙️ menu (設定 / 登出) at top right — no calendar or statistics pages. The dashboard shows the date, three stat cards (待傳 LINE / 待撥電話 / 逾期未確認), a 今日進度 bar, the tab bar and a table: 病患 (name, phone, note) · 回診日 · 倒數 badge · 提醒進度 (compact dots + stage + 「N 天前・未接」) · 動作 (contact button, ✓ 確認, 改約 ▾, ··· menu). 「＋新增病患」 and 「匯入 Excel」 live on 病患清單. Orange is the accent colour, green the confirm button. UI wording says 病患, not 客人.
