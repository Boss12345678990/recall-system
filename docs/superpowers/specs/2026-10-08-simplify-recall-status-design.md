# Simplify Recall Status — Design

- **Date:** 2026-10-08
- **Status:** Approved in conversation; awaiting written-spec review
- **Changes:** the recall statuses and dashboard tabs in [the v1 design](2026-10-06-dental-recall-system-design.md) and [CLAUDE.md](../../../CLAUDE.md). Everything not mentioned here stays as it is.

## 1. Why

Five dashboard tabs (待辦 · 等待回覆 · 已確認 · 無法聯絡 · 待重新追蹤) and four statuses are too many for reception to keep in their heads. In practice, once a patient replies there are only two outcomes, **coming** or **not coming**. Patients who never answer don't need to be tracked anymore. They drop out of the dashboard, and the cycle starts again when they call or walk in.

**Success criteria**

1. The dashboard has three tabs: 待辦 · 等待回覆 · 已確認.
2. A recall only ever needs one of three outcomes from staff: keep contacting, 會來, or 結束.
3. A recall that has ended (declined, unreachable, no-show, or imported past due) never shows on the dashboard. It is still visible on the patient list and can be restarted with 改約.

## 2. Recall lifecycle

| Status | Meaning | UI label | Where it shows |
|---|---|---|---|
| `PENDING` | Still contacting, or waiting for a reply | 追蹤中 | 待辦 (next step due) / 等待回覆 (contacted, next step not yet due) |
| `CONFIRMED` | Patient said they will come | 確認複診 | 已確認 |
| `CLOSED` (new, replaces `UNREACHABLE`) | This cycle is over without a visit | 已結束 | Patient list and patient detail only |
| `COMPLETED` | Patient came back (a visit was recorded) | 已回診 | History only, unchanged |

`CLOSED` always carries a `closeReason`:

| `closeReason` | UI label | Set by |
|---|---|---|
| `DECLINED` | 不來 | Staff click 不來 (from `PENDING` or `CONFIRMED`) |
| `NO_ANSWER` | 聯絡不上 | Recording call 3 with no answer (automatic) |
| `NO_SHOW` | 沒來 | Staff click 沒來 on a `CONFIRMED` recall |
| `IMPORT_OVERDUE` | 匯入時已過期 | Excel import of a row whose due date has already passed |

`closeReason` is `null` for every status except `CLOSED`.

The contact steps (`NOT_CONTACTED → LINE_SENT → CALLED_1 → CALLED_2 → CALLED_3`), their offsets, the computed-on-read to-do list and the urgency order are all unchanged.

## 3. Rules (`server/src/domain/recallRules.js`, still pure)

- **Call 3 no answer:** `applyAction(..., 'CALL_NO_ANSWER')` reaching `CALLED_3` sets `status: 'CLOSED', closeReason: 'NO_ANSWER'` (was `UNREACHABLE`).
- **New action `DECLINE`:** allowed when status is `PENDING` or `CONFIRMED`. Sets `status: 'CLOSED', closeReason: 'DECLINED'`. The step is left as it is.
- **New action `NO_SHOW`:** allowed only when status is `CONFIRMED`. Sets `status: 'CLOSED', closeReason: 'NO_SHOW'`.
- `applyAction` no longer returns `null` just because the status isn't `PENDING`. Each action checks its own allowed statuses: `LINE_SENT`, `CALL_NO_ANSWER` and `CONFIRM` need `PENDING`; `DECLINE` needs `PENDING` or `CONFIRMED`; `NO_SHOW` needs `CONFIRMED`.
- All actions go through the existing actions endpoint, so they are recorded as `ACTION` events and can be undone. `closeReason` joins `MUTABLE_FIELDS` so snapshots and undo cover it.
- **Manual edit:** status can be set to `PENDING`, `CONFIRMED` or `CLOSED`. Setting `CLOSED` requires a `closeReason` (validation error otherwise). Moving to any other status clears `closeReason`. Manually setting step `CALLED_3` with no status given closes the recall with `NO_ANSWER`, as it does today. `PENDING` at `CALLED_3` stays rejected.
- **Restart / 改約:** still allowed for any status except `COMPLETED`, which now includes `CLOSED`. `restartFields` also clears `closeReason`.
- **`onHold` is removed** everywhere: `nextAction`, `applyAction`, `applyManualEdit` (the "a new due date releases a held recall" branch goes away) and `restartFields`.

## 4. Data and migration

Prisma schema:

- `enum RecallStatus { PENDING CONFIRMED CLOSED COMPLETED }`
- `enum CloseReason { DECLINED NO_ANSWER NO_SHOW IMPORT_OVERDUE }`
- `Recall.closeReason CloseReason?`
- Drop `Recall.onHold` and the `@@index([status, onHold])`. Replace it with `@@index([status])`.

A single migration with hand-written SQL, run in this order:

1. Add `CLOSED` to the status enum (keep `UNREACHABLE` for now) and add the `closeReason` column.
2. `UPDATE Recall SET status = 'CLOSED', closeReason = 'NO_ANSWER' WHERE status = 'UNREACHABLE'`
3. `UPDATE Recall SET status = 'CLOSED', closeReason = 'IMPORT_OVERDUE' WHERE onHold = true AND status = 'PENDING'`
4. Remove `UNREACHABLE` from the enum, drop `onHold` and its index, and add the new index.

`RecallEvent.before/after` JSON written before the migration may still contain `UNREACHABLE` or `onHold`. History display maps `UNREACHABLE` to 聯絡不上 and ignores `onHold`. Undo restores only the fields in the current `MUTABLE_FIELDS` from `before`, treating a missing `closeReason` as `null`. That way, undoing an action recorded before the migration (whose `before` was always `PENDING`) still works.

## 5. API

- `GET /recalls?list=` accepts only `waiting` and `confirmed`. `unreachable` and `import-overdue` are removed from `LIST_QUERIES`, `RECALL_LISTS` and the `counts` returned by today.
- The `waiting` query drops `onHold: false`. Today's query is `status: 'PENDING'`.
- The actions endpoint accepts `DECLINE` and `NO_SHOW` alongside the existing actions.
- The recall PATCH validator accepts `status ∈ {PENDING, CONFIRMED, CLOSED}` and an optional `closeReason`.
- The patient list `status` filter accepts `PENDING`, `CONFIRMED` and `CLOSED`.
- The recall mapper drops `onHold` and adds `closeReason`.

## 6. Excel import

- Rows whose due date has passed are created as `status: 'CLOSED', closeReason: 'IMPORT_OVERDUE'` (instead of `onHold: true`).
- Preview and result field `onHold` is renamed `closed`. The preview text reads 「已過回診日，匯入後不追蹤：N 筆」.

## 7. Frontend

- **Dashboard tabs:** 待辦 · 等待回覆 · 已確認. The 無法聯絡 and 待重新追蹤 tabs and their counts are removed.
- **Row ··· menu:** 「標記為聯絡不上」 becomes 「不來」 (danger tone). It sends the `DECLINE` action instead of a status PATCH, so it can be undone. It is shown for `PENDING` and `CONFIRMED` recalls.
- **已確認 tab:** rows whose due date has passed (the red 逾期 badge) also get a 「沒來」 button that sends `NO_SHOW`.
- **改約 label:** shows 「重新追蹤」 for `CLOSED` recalls (was `UNREACHABLE` / `onHold`), and 「改約」 otherwise.
- **Labels (`labels.js`):** `STATUS_LABELS` = 追蹤中 / 確認複診 / 已結束 / 已回診, plus `UNREACHABLE: '聯絡不上'` kept for old history entries. New `CLOSE_REASON_LABELS`. `ACTION_LABELS` gains `DECLINE: '不來'` and `NO_SHOW: '沒來'`.
- **Patient list and patient detail:** a closed recall shows 「已結束（<reason>）」. The status filter offers 追蹤中 / 確認複診 / 已結束.
- **Recall editor:** the status select offers the three editable statuses. A reason select appears when 已結束 is chosen.
- **`recallDisplay.js`:** remove the `onHold` → 「待重新追蹤」 branch. Add stage text for closed recalls.

## 8. Other

- `server/src/scripts/demoData.js`: replace `UNREACHABLE` / `onHold` samples with `CLOSED` samples, one per reason.
- CLAUDE.md: update the recall status list, the "Recording call 3" rule, the five-tab list and the Excel import bullet to match this design.

## 9. Testing

- **Unit (`recallRules`):**
  - call 3 closes with `NO_ANSWER`
  - `DECLINE` from `PENDING` and from `CONFIRMED`; rejected from `CLOSED` and `COMPLETED`
  - `NO_SHOW` only from `CONFIRMED`
  - a manual `CLOSED` without a reason is rejected
  - moving away from `CLOSED` clears the reason
  - restart from `CLOSED` clears the reason
  - `nextAction` is `null` for `CLOSED`
- **Integration:**
  - the lists endpoint rejects the removed list names
  - today's counts contain only `waiting` and `confirmed`
  - import creates past-due rows as `CLOSED/IMPORT_OVERDUE`
  - `DECLINE` and `NO_SHOW` through the actions endpoint can be undone
  - undo of an action whose `before` snapshot still has `onHold` and no `closeReason` succeeds
  - the patient list filters by `CLOSED`
- **Migration:** run against a test DB seeded with `UNREACHABLE` and `onHold` rows, then check the converted values.
- **Client:**
  - RecallRowActions shows 不來 and 沒來 in the right cases
  - the dashboard renders three tabs
  - labels for closed recalls render correctly
