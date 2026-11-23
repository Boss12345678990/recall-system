# Today's list keeps finished patients (design)

Date: 2026-11-20 · Size: small change

## Why

Staff want 今日待辦 to show the whole day's work: what is still to do, and what they already did today. Right now a patient vanishes the moment LINE, a call or 確認 is recorded, so the list can't be used to review the day.

## Rules (from the user)

- `haveAction` is true only when a contact step is due: LINE (or call 1 for patients without LINE) from 回診日 − 7 days (the 提前傳 LINE setting), and each call from its scheduled date (previous contact + the configured gap). A patient called yesterday with a 2-day gap is not on today's list.
- A missed step stays due: the patient keeps showing on later days (with 逾期) until an action or 確認 is recorded. (This is already how it works.)
- When an action is recorded today (傳 LINE, 第 N 通未接, 確認), the patient stays on today's list, greyed out and marked as done, instead of disappearing.

## Approaches

- **A. Derive "done today" from the recall's own dates (chosen).** Done today = `lineSentAt`, `call1At`, `call2At`, `call3At` or `confirmedAt` equals today (Asia/Taipei). 復原 restores those fields, so undo needs no special handling, and no schema change is needed. Limit: 改約 and 標記為聯絡不上 set none of those dates, so they still remove the patient from the list.
- B. Derive it from the event history. Covers every change, but undo needs extra rules. Not chosen.
- Storing `haveAction` as a database column: needs a daily job to switch it on, and the project avoids cron/background work. Rejected.

## Design

- **Domain (pure, unit-tested):** `completedToday(recall, today)` returns the latest contact done today: `CONFIRMED` > `CALL_3` > `CALL_2` > `CALL_1` > `LINE`, or `null`. Each today item carries `haveAction` (pending, not on hold, next step date ≤ today) and `completedToday`. If both apply, done wins.
- **Query:** today's list loads recalls that are not on hold and either `PENDING` or have one of the five dates equal to today, so confirmed (`CONFIRMED`) and third-call (`UNREACHABLE`) patients from today are included.
- **Order:** to-do items first in the existing urgency order, then done items (by due date, then name).
- **Numbers:** the 待辦 tab count, the stat cards (待傳 LINE / 待撥電話 / 逾期未確認) and `summary` count only items still to do. 今日進度 = done / (done + to do), derived from the same list; this replaces the event-table query `countHandledToday`.
- **Row look:** a done row is greyed out; the 動作 cell shows 「✓ 今日已完成・已傳 LINE」 (or 第 N 通未接 / 確認複診) plus the ··· menu, with no contact, 確認 or 改約 buttons. The undo toast still works.
- **Unchanged:** the 已確認 and 需再連絡 tabs (a patient confirmed today shows in both 待辦, as done, and 已確認).

## Left to the builder

Exact grey styling, test fixtures, and CLAUDE.md wording.
