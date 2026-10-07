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
    // zh-Hant-TW collates by stroke count: 乙 (1 stroke) before 甲 (5).
    expect(names).toEqual(['較逾期', '乙', '甲', '較近', '較遠'])
  })
})
