# Dental Recall System — Design

- **Date:** 2026-10-06
- **Status:** Approved in conversation; awaiting written-spec review
- **Supersedes:** the parts of [SPEC.md](../../../SPEC.md) listed in §2. Everything in SPEC.md not contradicted here (non-functional requirements, response envelope, security baseline) still applies.

## 1. Goal

Replace the clinic's paper recall process. Today, reception writes each patient's name, birth date and next visit date (visit + 6 months) on paper, then hunts through the paper daily to find who to LINE and who to phone. The system must tell 2–3 reception staff, every morning:

- who to contact **today**,
- what to do for each (send LINE, or which call number),
- how many times each has already been contacted,
- who is most urgent.

Staff still send LINE messages and make phone calls by hand, then record each one with a single click.

**Success criteria**

1. Opening the dashboard shows a correct, urgency-sorted to-do list without anyone looking at paper.
2. Recording a contact attempt takes one click, and a mis-click can be undone.
3. Existing paper records (likely thousands) can be imported from Excel.
4. Every user-facing string is Traditional Chinese (zh-TW).

## 2. Changes from SPEC.md

| SPEC.md | This design | Why |
|---|---|---|
| `Appointment` with start/end time | `Visit` (date a patient came in) + `Recall` (one follow-up cycle toward a due date) | The clinic does not book time slots in this system |
| `Patient.status` | Status lives on `Recall` | Status describes a follow-up cycle, not a person |
| Statuses 正在追蹤 / 未回覆 / 已完成 / 不需回診, plus appointment statuses | Recall **step** + recall **status** (§4.2) | Matches the clinic's actual workflow |
| Dashboard = today's appointments | Dashboard = today's contact to-do list | That is the daily pain point |
| LINE Messaging API integration | Manual LINE in v1; staff click "已傳 LINE" | The clinic may not have a LINE Official Account yet |
| Vercel + Render + separate MySQL | One service (Express serves the built React app and the API) + managed MySQL on the same platform (e.g. Railway) | Fewer moving parts, no cold starts, no CORS |
| JWT (storage unspecified) | JWT in an `httpOnly`, `SameSite=Strict`, `Secure` cookie | Same-origin deployment makes this simple and keeps the token away from page scripts |

## 3. Out of scope for v1

Appointment time-slot booking · sending LINE or SMS from the system · desktop/push notifications · individual staff accounts and roles · reporting · multi-clinic.

## 4. Domain

### 4.1 Entities

**User** — `id`, `username` (unique), `passwordHash`, timestamps. v1 has one shared account, created by a seed script from environment variables.

**Patient** — `id`, `name`, `phoneNumber` (digits only), `birthDate` (DATE), `hasLine` (bool, default true), `comment` (TEXT, nullable), timestamps.
- `(name, birthDate)` is unique: it is how staff tell patients apart, and how the import detects duplicates.

**Visit** — `id`, `patientId`, `visitDate` (DATE), `note` (nullable), `createdAt`.

**Recall** — one follow-up cycle.

| Field | Notes |
|---|---|
| `id`, `patientId`, `visitId` | `visitId` is the visit that started this cycle |
| `dueDate` (DATE) | Visit date + `recallIntervalMonths`. Editable. |
| `step` | enum, §4.2 |
| `status` | enum, §4.2 |
| `lineSentAt`, `call1At`, `call2At`, `call3At`, `confirmedAt` | DATE, nullable — the **actual** date each step was recorded |
| `onHold` | bool. True for recalls imported already past due (§6); excluded from today's to-do |
| `version` | int, incremented on every update; used for concurrency control (§5.3) |
| timestamps | |

Indexes: `(status, onHold)`, `patientId`.

**RecallEvent** — the history of every change to a recall.
- `id`, `recallId`, `type` (`ACTION` · `MANUAL_EDIT` · `UNDO` · `VISIT_RECORDED` · `RESTART`), `action` (nullable; the action name for `ACTION` events), `note` (nullable), `createdAt`.
- `before` and `after` (JSON): snapshots of the recall's mutable fields: step, status, the five dates, `dueDate`, `onHold`.
- Undo and visit deletion work by restoring a `before` snapshot.

**ClinicSetting** — a single row (`id = 1`):

| Field | Default | Allowed range |
|---|---|---|
| `recallIntervalMonths` | 6 | 1–24 |
| `lineLeadDays` | 7 | 1–30 |
| `callAfterLineDays` | 3 | 1–14 |
| `callGapDays` | 2 | 1–14 |

Settings are read when the system computes something. Changing `recallIntervalMonths` affects only recalls created afterwards, because `dueDate` is stored. Changing the day offsets affects action dates immediately, because those are computed on read.

### 4.2 Step and status

| `step` | UI label |
|---|---|
| `NOT_CONTACTED` | 尚未聯絡 |
| `LINE_SENT` | 已傳 LINE |
| `CALLED_1` | 已撥打 1 次 |
| `CALLED_2` | 已撥打 2 次 |
| `CALLED_3` | 已撥打 3 次 |

| `status` | UI label | Meaning |
|---|---|---|
| `PENDING` | 未確認 | In progress (default) |
| `CONFIRMED` | 確認複診 | Patient said they will come |
| `UNREACHABLE` | 聯絡不上 | No answer after 3 calls, **or** patient declined (reason goes in the event note) |
| `COMPLETED` | 已回診 | Patient came back; a newer recall exists |

Invariant: a patient has at most one recall whose status is not `COMPLETED` — the **current recall** (it may be `PENDING`, `CONFIRMED` or `UNREACHABLE`). A patient created without a visit has none.

### 4.3 Recall rules (pure functions)

These live in `server/src/domain/recallRules.js`. They take plain objects (`recall`, `patient.hasLine`, `settings`, `today`) and have no database access.

**`nextAction(recall, hasLine, settings)`** returns `{ action, actionDate } | null`:

| Condition | `action` | `actionDate` |
|---|---|---|
| status ≠ `PENDING`, or `onHold` | — (null) | — |
| step `NOT_CONTACTED`, `hasLine` | `SEND_LINE` | `dueDate − lineLeadDays` |
| step `NOT_CONTACTED`, no LINE | `CALL_1` | `dueDate − lineLeadDays` |
| step `LINE_SENT` | `CALL_1` | `lineSentAt + callAfterLineDays` |
| step `CALLED_1` | `CALL_2` | `call1At + callGapDays` |
| step `CALLED_2` | `CALL_3` | `call2At + callGapDays` |
| step `CALLED_3` | — (null) | — |

- **`overdueDays(actionDate, today)`** = `max(0, today − actionDate)` in days.
- **Today's to-do list** = every recall whose `nextAction` is not null and whose `actionDate ≤ today`.
- **`compareUrgency(a, b)`** sorts in this order:
  1. overdue before not overdue;
  2. action rank: `CALL_3` > `CALL_2` > `CALL_1` > `SEND_LINE`;
  3. greater `overdueDays` first;
  4. earlier `dueDate` first;
  5. patient name, as a stable final tiebreak.
- **`addMonths`** clamps to the end of the month: Aug 31 + 6 months = Feb 28 (or Feb 29).
- **"Today"** is the current date in `Asia/Taipei`, computed once per request by the service and passed in.

### 4.4 Allowed transitions

**One-click actions** (`POST /recalls/:id/actions`). All of them require status `PENDING` and `onHold = false`.

| Action | Allowed when | Effect |
|---|---|---|
| `LINE_SENT` | step `NOT_CONTACTED` and `hasLine` | step → `LINE_SENT`, `lineSentAt` = today |
| `CALL_NO_ANSWER` | step ∈ {`LINE_SENT`, `CALLED_1`, `CALLED_2`}, or step `NOT_CONTACTED` and no LINE | step +1 call, `callNAt` = today. Reaching `CALLED_3` also sets status → `UNREACHABLE` |
| `CONFIRM` | any step | status → `CONFIRMED`, `confirmedAt` = today |

**Manual edit** (`PATCH /recalls/:id`) can change `step`, `status` and `dueDate`, with an optional note.
- Moving the step **forward** fills any missing step dates with today. Moving it **backward** clears the dates of steps after the new one. This keeps `nextAction` always computable.
- Status `COMPLETED` cannot be set by hand. Only recording a visit sets it, because a new recall must be created at the same time.
- Status `PENDING` together with step `CALLED_3` is rejected with the message 「已撥打 3 次的追蹤無法設為未確認，請同時將步驟改回較早的階段」.

**Restart** (`POST /recalls/:id/restart` with `{ dueDate }`) is allowed on recalls that are `onHold`, `UNREACHABLE`, or `CONFIRMED` with a past due date. It sets status `PENDING`, step `NOT_CONTACTED`, clears the step dates, sets `onHold = false`, and sets the new `dueDate` (UI default: today + `lineLeadDays`).

**Undo** (`POST /recalls/:id/undo` with `{ eventId }`) only works if `eventId` is the recall's latest event and that event's type is `ACTION`. It restores the event's `before` snapshot and writes an `UNDO` event.

## 5. Backend

### 5.1 Structure

Requests flow **route → controller → service → Prisma**; no layer is skipped. The structure follows SPEC.md §11, with these changes:

```text
server/src/
├── app.js                 # express app: middleware, /api routes, static client/dist, SPA fallback
├── server.js              # listen
├── config/env.js          # validated env (Zod)
├── routes/                # auth, patient, visit, recall, import, setting, health
├── controllers/           # one per route file
├── services/              # auth, patient, visit, recall, import, setting
├── scripts/reset-password.js  # admin CLI, not an HTTP route — see §5.2
├── domain/recallRules.js  # §4.3 — pure, no imports from services/prisma
├── validators/            # Zod schemas per resource
├── middleware/            # auth, validate(schema), error, requestLogger
├── errors/AppError.js     # AppError + NotFound/Validation/Conflict/Unauthorized
└── lib/
    ├── prisma.js
    ├── logger.js          # pino
    └── dates.js           # today() in Asia/Taipei, DATE ↔ 'YYYY-MM-DD'
```

- **Routes** only connect middleware to controller functions.
- **Controllers** read `req`, call **one** service function, and send `{ success: true, data }` with status 200 or 201.
- **Services** contain all business logic and all Prisma calls. They never see `req` or `res`, and they throw `AppError` subclasses.
- There is no LINE module in v1. A future LINE integration would call `recallService.recordAction(..., 'LINE_SENT')`, so the core stays unchanged.

### 5.2 API

All routes are under `/api`, and all except `auth/login` and `health` require the auth cookie. Dates travel as `'YYYY-MM-DD'` strings.

| Method & path | Purpose |
|---|---|
| `POST /auth/login` | Sets the JWT cookie (12 h). Rate-limited (10 attempts / 15 min / IP) |
| `POST /auth/logout` | Clears the cookie |
| `GET /auth/me` | Session check for the client |
| `PATCH /auth/password` | `{ currentPassword, newPassword }`. Requires knowing the current password |
| `GET /patients?search=&status=&page=` | Paginated, 50 per page. `search` matches part of the name, part of the phone digits, or an exact birth date. `status` filters by current recall status |
| `GET /patients/:id` | Patient + current recall (with computed `nextAction`) + visits + recall events, newest first |
| `POST /patients` | `{ ...patient, registerVisitToday?: bool }`. A duplicate `(name, birthDate)` → 409 with `existingPatientId` |
| `PATCH /patients/:id` · `DELETE /patients/:id` | Delete cascades to visits, recalls and events |
| `POST /patients/:id/visits` | `{ visitDate? = today, note? }` (transaction, §5.3) |
| `DELETE /visits/:id` | Latest visit of its patient only (transaction, §5.3) |
| `GET /recalls/today` | `{ summary: { total, overdue }, items: [...] }`, sorted by `compareUrgency` |
| `GET /recalls?list=confirmed-no-show\|import-overdue\|unreachable` | The three secondary lists |
| `POST /recalls/:id/actions` | `{ action, version }` → `{ recall, eventId }` |
| `POST /recalls/:id/undo` | `{ eventId, version }` |
| `PATCH /recalls/:id` | `{ step?, status?, dueDate?, note?, version }` |
| `POST /recalls/:id/restart` | `{ dueDate, version }` |
| `GET /imports/template` | `.xlsx` template download |
| `POST /imports/preview` | multipart `.xlsx` (≤ 5 MB, ≤ 5,000 rows) → per-row result (§6) |
| `POST /imports/commit` | `{ rows }` (the rows the preview marked valid) |
| `GET /settings` · `PATCH /settings` | §4.1 ranges |
| `GET /health` | `SELECT 1` against the DB; 200 or 503 |

What the secondary lists contain:
- `confirmed-no-show`: status `CONFIRMED` and `dueDate < today`.
- `import-overdue`: `onHold = true`.
- `unreachable`: status `UNREACHABLE`, sorted by most recently updated.

**Password recovery.** There is no "forgot password" flow in the UI — with one shared account there is nobody for it to email. Passwords stay bcrypt-hashed per SPEC.md §4.4 (never stored or logged in plain text). If the clinic forgets it, the developer runs `node server/src/scripts/reset-password.js <new-password>` against the production database (e.g. `railway run`), which hashes and overwrites the one `User` row directly — no API route, so it can't be hit over HTTP.

### 5.3 Transactions and concurrency

- **Record visit.** One `$transaction`:
  1. Reject if `visitDate` is in the future, earlier than the patient's latest visit, or equal to an existing visit date (409 「該日期已登記過看診」).
  2. Create the visit.
  3. Set the current recall (if any, whatever its status) to `COMPLETED` and write a `VISIT_RECORDED` event with its `before` snapshot.
  4. Create the new recall with `dueDate = visitDate + recallIntervalMonths`.
- **Delete visit.** One `$transaction`:
  1. Reject unless it is the patient's latest visit.
  2. Delete its recall (events cascade).
  3. Restore the previous recall from the `before` snapshot of its `VISIT_RECORDED` event.
  4. Delete the visit.
- **Optimistic concurrency.** Every recall mutation sends the `version` the client last saw. The service runs `updateMany({ where: { id, version }, data: { ..., version: { increment: 1 } } })` inside the transaction that also writes the event. If 0 rows are updated, it returns 409 `RECALL_STALE` 「這筆資料剛被其他人更新，已重新整理」. The client then refetches.

### 5.4 Validation and errors

- Each route has a Zod schema for `params`, `query` and `body`, applied by `validate(schema)` middleware. Validation failures → 400 `VALIDATION_ERROR`, with `details: [{ field, message }]`, messages in zh-TW.
- Field rules:
  - `name` is required, at most 50 characters.
  - `phoneNumber`: separators are stripped, then it must be 9–10 digits starting with `0`.
  - `birthDate` cannot be in the future.
  - `dueDate` must be a valid date.
- `AppError(status, code, message)` has these subclasses:

| Class | HTTP status |
|---|---|
| `ValidationError` | 400 |
| `UnauthorizedError` | 401 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |

- The error middleware maps known errors to the SPEC.md §9 envelope. It maps Prisma `P2002` → 409, `P2025` → 404, and connection errors → 503. Everything else is logged with its stack and returns 500 `INTERNAL_ERROR` 「系統發生錯誤，請稍後再試」.
- Logging uses `pino-http`: one line per request (method, path, status, ms), plus all errors.

## 6. Excel import

**Template columns:** 姓名 · 生日 · 電話 · 上次看診日 · 有加 LINE（是／否, default 是）· 備註. Every column except 備註 is required. (有加 LINE was added to the column list approved in conversation, because `Patient.hasLine` is needed.)

**Accepted date formats:**
- Excel date cells
- `YYYY-MM-DD` and `YYYY/MM/DD`
- ROC years: `75/1/1` and `075/01/01`, where a 2–3 digit year means ROC year + 1911

**Preview.** The server parses the file with `exceljs`, stores nothing, and returns a status for each row:
- `valid`
- `error`, with `{ column, message }`
- `duplicate-in-file`
- `duplicate-existing` (a `(name, birthDate)` that already exists; skipped, not merged)

For each valid row it also returns the computed `dueDate` and an `onHold` flag (true when `dueDate < today`).

**Commit.** The client sends the valid rows back. The server **re-validates everything** and writes all rows in a single transaction (timeout raised to 120 s), so the import is all-or-nothing. For each row it creates a Patient, a Visit (上次看診日) and a Recall. If a duplicate appeared between preview and commit, the whole commit returns 409 and the user re-previews.

## 7. Frontend

React + Vite (JavaScript). Libraries:
- React Router
- TanStack Query for server state; refetch on window focus and every 5 minutes, so 2–3 staff see each other's changes
- Tailwind CSS
- dayjs

All text is zh-TW. The layout follows the uncluttered principle in CLAUDE.md: show what to act on now, and push details one level down.

| Page | Contents |
|---|---|
| 登入 | username, password |
| 今日待辦 (home) | Summary bar (「今天要聯絡 N 人 · 逾期 M 人」) + 「登記今日看診」 button. One spaced card per patient: name, phone (click to copy), a 4-dot progress bar (LINE → 1 → 2 → 3; hovering a dot shows that step's date), the next action label, one badge (red 「逾期 N 天」 or 「回診日 MM/DD」), and the allowed action buttons. Clicking the card opens the patient. After any action, a toast 「已記錄 · 復原」 shows for 10 s. Links to the three secondary lists, each with a count. |
| 登記今日看診 (dialog) | Search by name or phone → 「登記看診」. When nothing matches, a new-patient form that registers today's visit on save. |
| 客人列表 | Search + status filter. Columns: name, phone, birth date, due date, step, status. |
| 客人詳細 | Editable basic info · current recall: step and status selects, due date, note, and the progress shown as a vertical timeline with dates and notes · visit list (latest can be deleted) · event history · delete patient (confirmation dialog). |
| 匯入 | Download template → upload → preview table (errors highlighted per cell, duplicates listed) → 「確認匯入 N 筆」. |
| 設定 | The four §4.1 settings · change password. |

API calls go through `client/src/services/api.js`. It unwraps the envelope, throws on `success: false`, redirects to login on 401, and refetches the recall on 409 `RECALL_STALE`. The UI only shows success after a 2xx response.

## 8. Testing

Vitest everywhere.

1. **`recallRules` unit tests** (most coverage):
   - every row of the §4.3 and §4.4 tables
   - patients without LINE
   - month-end clamping
   - overdue boundaries (an action date equal to today counts as due, with 0 overdue days)
   - urgency ordering
   - all with fixed dates
2. **Service integration tests** against a real MySQL test database (`DATABASE_URL` in `.env.test`; local MySQL 8.4 or Docker), reset between tests:
   - record and delete visit
   - action, undo and stale-version 409
   - manual edit date filling and clearing
   - restart
   - import commit and its duplicate race
3. **API tests** with Supertest:
   - unauthenticated → 401
   - Zod errors → 400 envelope
   - not found → 404
   - no failure ever returns 2xx
4. **Frontend component tests** (Vitest + Testing Library) for the progress bar and the to-do card's button logic only.

## 9. Repository layout and deployment

- npm workspaces: root `package.json` with `client/` and `server/`.
- The root `build` builds the client; the server serves `client/dist` with an SPA fallback for non-`/api` routes.
- Deployment: one Railway service plus Railway MySQL.
  - Environment: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (seed only), `NODE_ENV`.
  - The start command runs `prisma migrate deploy` and then the server.
  - Health check: `/api/health`.
  - Auto-restart on crash.
