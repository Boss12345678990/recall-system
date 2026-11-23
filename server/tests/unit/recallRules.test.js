import { describe, it, expect } from 'vitest'
import {
  nextAction, overdueDays, buildTodayItems, completedToday, applyAction, applyManualEdit, canRestart, restartFields, snapshot,
} from '../../src/domain/recallRules.js'

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

  it('includes items due today and excludes future, earlier-confirmed and on-hold ones', () => {
    const items = [
      item('今天', { dueDate: '2026-10-13' }),
      item('明天', { dueDate: '2026-10-14' }),
      item('已確認', { dueDate: '2026-10-13', status: 'CONFIRMED', confirmedAt: '2026-10-01' }),
      item('暫停', { dueDate: '2026-09-01', onHold: true }),
      item('暫停但今天有日期', { dueDate: '2026-09-01', onHold: true, lineSentAt: TODAY }),
    ]
    const result = buildTodayItems(items, SETTINGS, TODAY)
    expect(result.map((i) => i.patient.name)).toEqual(['今天'])
    expect(result[0]).toMatchObject({
      haveAction: true, completedToday: null, waiting: false, nextAction: { action: 'SEND_LINE', actionDate: TODAY, overdueDays: 0 },
    })
  })

  it('keeps items acted on today, marked done, after the to-do items', () => {
    const items = [
      item('今天確認', { dueDate: '2026-10-08', status: 'CONFIRMED', confirmedAt: TODAY }),
      item('今天傳LINE', { dueDate: '2026-10-13', step: 'LINE_SENT', lineSentAt: TODAY }),
      item('待傳', { dueDate: '2026-10-20', step: 'NOT_CONTACTED' }, true),
      item('逾期', { dueDate: '2026-10-10' }),
    ]
    const result = buildTodayItems(items, SETTINGS, TODAY)
    expect(result.map((i) => [i.patient.name, i.haveAction, i.completedToday])).toEqual([
      ['逾期', true, null],
      ['今天確認', false, 'CONFIRMED'],
      ['今天傳LINE', false, 'LINE'],
    ])
  })

  it('sorts by countdown: the earliest due date first, whatever the step', () => {
    const items = [
      item('第1次', { step: 'LINE_SENT', lineSentAt: '2026-10-03', dueDate: '2026-10-20' }),
      item('LINE', { dueDate: '2026-10-13' }),
      item('第3次', { step: 'CALLED_2', call2At: '2026-10-04', dueDate: '2026-10-09' }),
      item('逾期LINE', { dueDate: '2026-10-07' }),
    ]
    const names = buildTodayItems(items, SETTINGS, TODAY).map((i) => i.patient.name)
    expect(names).toEqual(['逾期LINE', '第3次', 'LINE', '第1次'])
  })

  it('breaks due-date ties by the later contact step first, then name', () => {
    const items = [
      item('乙', { dueDate: '2026-10-13' }),
      item('甲', { dueDate: '2026-10-13' }),
      item('第2次', { step: 'CALLED_1', call1At: '2026-10-04', dueDate: '2026-10-13' }),
      item('第1次', { step: 'LINE_SENT', lineSentAt: '2026-10-03', dueDate: '2026-10-13' }),
    ]
    const names = buildTodayItems(items, SETTINGS, TODAY).map((i) => i.patient.name)
    // zh-Hant-TW collates by stroke count: 乙 (1 stroke) before 甲 (5).
    expect(names).toEqual(['第2次', '第1次', '乙', '甲'])
  })

  it('lists contacted patients whose next step is not due yet as waiting, last, soonest step first', () => {
    const items = [
      item('後天打', { step: 'LINE_SENT', lineSentAt: '2026-10-05', dueDate: '2026-10-12' }),
      item('明天打', { step: 'CALLED_1', call1At: '2026-10-05', dueDate: '2026-10-15' }),
      item('今天傳', { step: 'LINE_SENT', lineSentAt: TODAY, dueDate: '2026-10-13' }),
      item('該打了', { step: 'LINE_SENT', lineSentAt: '2026-10-03', dueDate: '2026-10-20' }),
      item('還沒聯絡', { dueDate: '2026-10-20' }),
      item('已確認', { step: 'LINE_SENT', lineSentAt: '2026-10-05', status: 'CONFIRMED', confirmedAt: '2026-10-05' }),
    ]
    const result = buildTodayItems(items, SETTINGS, TODAY)
    expect(result.map((i) => [i.patient.name, i.haveAction, i.completedToday, i.waiting])).toEqual([
      ['該打了', true, null, false],
      ['今天傳', false, 'LINE', false],
      ['明天打', false, null, true],
      ['後天打', false, null, true],
    ])
    expect(result[2].nextAction).toMatchObject({ action: 'CALL_2', actionDate: '2026-10-07' })
  })
})

describe('completedToday', () => {
  const TODAY = '2026-10-06'

  it('reports the latest contact made today', () => {
    expect(completedToday(recall({ call2At: TODAY, call3At: TODAY }), TODAY)).toBe('CALL_3')
    expect(completedToday(recall({ lineSentAt: TODAY, confirmedAt: TODAY }), TODAY)).toBe('CONFIRMED')
    expect(completedToday(recall({ call1At: TODAY }), TODAY)).toBe('CALL_1')
  })
  it('ignores contacts from earlier days', () => {
    expect(completedToday(recall({ lineSentAt: '2026-10-05', confirmedAt: '2026-10-01' }), TODAY)).toBeNull()
  })
})

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
  it('sets the agreed appointment date when confirming with one', () => {
    expect(applyAction(recall(), true, 'CONFIRM', TODAY, { dueDate: '2026-12-03' }))
      .toEqual({ status: 'CONFIRMED', confirmedAt: TODAY, dueDate: '2026-12-03' })
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
  it('takes an on-hold recall off hold when given a due date from today on', () => {
    const { patch } = applyManualEdit(recall({ onHold: true, dueDate: '2026-01-01' }), { dueDate: '2026-10-13' }, TODAY)
    expect(patch).toMatchObject({ dueDate: '2026-10-13', onHold: false })
  })
  it('keeps an on-hold recall on hold when the new due date is still in the past', () => {
    const { patch } = applyManualEdit(recall({ onHold: true, dueDate: '2026-01-01' }), { dueDate: '2026-02-01' }, TODAY)
    expect(patch.onHold).toBe(true)
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
    ['confirmed and due today (改約)', { status: 'CONFIRMED', dueDate: '2026-10-06' }, true],
    ['pending (改約)', {}, true],
    ['completed, even if on hold', { status: 'COMPLETED', onHold: true }, false],
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
