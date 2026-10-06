# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Pre-implementation. The only source of requirements so far is [SPEC.md](SPEC.md) plus the design decisions below, which were agreed with the user after SPEC.md was written and **override it where they conflict**. No code, build, lint or test commands exist yet — add them here once `server/` and `client/` are scaffolded.

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
- **Today's to-do list is computed on read** from step + dates — no cron jobs or background workers. Urgency order: overdue first, then call 3 > call 2 > call 1 > LINE; ties broken by nearest due date.
- Recalls with status `確認複診` whose due date has passed with no new visit appear in a separate "確認但未到" list.
- **Notifications are in-app only** (dashboard summary + red highlighting), no desktop/push notifications.
- **LINE is manual for v1.** Staff send from the clinic's LINE and click "已傳 LINE". Keep LINE code isolated in its own module so a later LINE Messaging API integration doesn't touch the core.
- **Excel import** of existing paper records (姓名, 生日, 電話, 上次看診日, 備註): preview-then-commit, duplicates detected by name + birth date, and recalls already past due on import go to a "匯入時已過期" list instead of flooding today's to-do.
- **Deployment:** a single service — Express serves the built React app and the API — plus a managed MySQL on the same platform (e.g. Railway). Not the Vercel + Render split in SPEC.md.
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

The user explicitly wants an uncluttered UI: show only what the staff member needs to act on now, and push details one level down (hover, expand, or the detail page). Example: a to-do card shows the patient, a 4-dot progress bar (LINE → call 1 → call 2 → call 3), the next action, one badge (overdue days or due date) and the action buttons — step dates appear on hover over the progress dots or on the patient detail page's vertical timeline, not inline on the card. Prefer spaced cards over dense tables.
