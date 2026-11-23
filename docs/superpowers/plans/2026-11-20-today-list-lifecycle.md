# Today's List Keeps Finished Patients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patients acted on today (LINE, call, 確認) stay on 今日待辦, greyed out and marked done, instead of disappearing.

**Architecture:** "Done today" is derived from the recall's own contact dates by a pure domain function; `buildTodayItems` returns to-do items then done items, each flagged with `haveAction` and `completedToday`. The client greys done rows and counts only to-do items in the tab badge and stat cards.

**Tech Stack:** Node/Express + Prisma (MySQL), React + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-today-list-lifecycle-design.md`

## Global Constraints

- All user-facing text is Traditional Chinese; identifiers and enum values stay English.
- "Today" is `todayInClinic()` (Asia/Taipei); dates are `YYYY-MM-DD` strings.
- Recall rules stay pure functions in `server/src/domain/recallRules.js`; Prisma access only in services.

## Review Focus

- A patient whose third call is recorded today (status becomes `UNREACHABLE`) must still show as done today, labelled 第 3 通未接.
- 復原 of today's only action must put the patient back to a normal to-do row (not done, not missing).
- A recall confirmed on an earlier day must not appear on today's list.
- An on-hold recall never appears, even if a contact date equals today.
- Done rows must offer no contact, 確認 or 改約 buttons (a second click would record a second action).

---

### Task 1: Domain rules for done-today

**Files:**
- Modify: `server/src/domain/recallRules.js`
- Test: `server/tests/unit/recallRules.test.js`

**Interfaces:**
- Produces: `completedToday(recall, today) -> 'CONFIRMED' | 'CALL_3' | 'CALL_2' | 'CALL_1' | 'LINE' | null` (first match in that order, comparing `confirmedAt`, `call3At`, `call2At`, `call1At`, `lineSentAt` to `today`).
- Produces: `buildTodayItems(items, settings, today)` now returns every item that is to do or done today, each with `nextAction`, `haveAction: boolean`, `completedToday`. `haveAction = !completedToday && nextAction !== null && nextAction.actionDate <= today`. On-hold items are excluded. Order: to-do items by `compareUrgency`, then done items by `dueDate`, then name (`zh-Hant-TW`).

- [ ] **Step 1: Tests** in `describe('completedToday')`: returns `'CALL_3'` when `call2At` and `call3At` are today; `'CONFIRMED'` beats `'LINE'` when both today; `null` when `confirmedAt` is yesterday. In `buildTodayItems`: a recall `{ status: 'CONFIRMED', confirmedAt: TODAY }` is included with `haveAction: false, completedToday: 'CONFIRMED'` and sorts after to-do items; `{ status: 'CONFIRMED', confirmedAt: '2026-10-01' }` is excluded; `{ onHold: true, lineSentAt: TODAY }` is excluded. Update the existing 'excludes … confirmed' test to the new shape.
- [ ] **Step 2:** `cd server && npx vitest run tests/unit/recallRules.test.js` — new tests FAIL.
- [ ] **Step 3:** Implement both functions.
- [ ] **Step 4:** Same command — PASS.

### Task 2: Today endpoint

**Files:**
- Modify: `server/src/services/recall.service.js` (`getToday`, remove `countHandledToday`)
- Test: `server/tests/integration/recalls.test.js`

**Interfaces:**
- Consumes: Task 1 `buildTodayItems`.
- Produces: `GET /api/recalls/today` → `{ today, summary: { total, overdue }, progress: { done, total }, counts, items }` where `summary` counts only `haveAction` items, `progress.done` = items with `completedToday`, `progress.total` = done + to-do.

- [ ] **Step 1: Tests:** after `LINE_SENT` on one of two due recalls, `items` has length 2, the acted one is last with `completedToday: 'LINE'`, `summary.total` is 1, `progress` is `{ done: 1, total: 2 }`. After `CONFIRM`, the patient is still in `items` with `completedToday: 'CONFIRMED'`. After `CALL_NO_ANSWER` from `CALLED_2`, the item has `status: 'UNREACHABLE'`, `completedToday: 'CALL_3'`. After `LINE_SENT` then undo, the item has `completedToday: null`, `haveAction: true`.
- [ ] **Step 2:** `npm run test:integration -w server` — new tests FAIL.
- [ ] **Step 3:** Query `{ onHold: false, OR: [{ status: 'PENDING' }, ...five date fields equal to today] }` (use `toDbDate(today)`), build items, derive summary and progress from them.
- [ ] **Step 4:** Same command — PASS.

### Task 3: Dashboard display

**Files:**
- Modify: `client/src/pages/DashboardPage.jsx`, `client/src/components/RecallRow.jsx`, `client/src/components/RecallRowActions.jsx`, `client/src/utils/recallDisplay.js`
- Test: `client/src/components/RecallRowActions.test.jsx`, `client/src/utils/recallDisplay.test.js`

**Interfaces:**
- Consumes: Task 2 item fields `haveAction`, `completedToday`.
- Produces: `completedLabel(kind) -> string`: `LINE` → 已傳 LINE, `CALL_n` → 第 n 通未接, `CONFIRMED` → 確認複診.

- [ ] **Step 1: Tests:** `completedLabel` returns the three labels; `RecallRowActions` with `completedToday: 'LINE'` renders 「✓ 今日已完成・已傳 LINE」 and only the `···` button.
- [ ] **Step 2:** `npm test -w client` — FAIL.
- [ ] **Step 3:** Done row: `opacity-60` on the row; actions cell shows the label + `···`. Stat cards count `items.filter((i) => i.haveAction)`.
- [ ] **Step 4:** `npm test -w client` — PASS; check in the browser; update CLAUDE.md (today's list rules).
