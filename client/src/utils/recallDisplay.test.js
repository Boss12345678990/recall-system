import { describe, it, expect } from 'vitest'
import { countdown, lastContact, primaryAction, stageLabel, rescheduleOptions, formatLongDate } from './recallDisplay.js'

const TODAY = '2026-10-08'
const recall = (overrides) => ({
  step: 'NOT_CONTACTED', status: 'PENDING', onHold: false, dueDate: '2026-10-15',
  lineSentAt: null, call1At: null, call2At: null, call3At: null, confirmedAt: null, nextAction: null,
  ...overrides,
})

describe('countdown', () => {
  it.each([
    ['2026-10-05', { label: '逾期 3 天', tone: 'danger' }],
    ['2026-10-08', { label: '今天', tone: 'danger' }],
    ['2026-10-09', { label: '還有 1 天', tone: 'warning' }],
    ['2026-10-11', { label: '還有 3 天', tone: 'warning' }],
    ['2026-10-12', { label: '還有 4 天', tone: 'muted' }],
  ])('due %s', (dueDate, expected) => expect(countdown(dueDate, TODAY)).toEqual(expected))
})

describe('lastContact', () => {
  it('is empty before any contact', () => expect(lastContact(recall(), TODAY)).toBeNull())
  it('describes an unanswered LINE', () => {
    expect(lastContact(recall({ step: 'LINE_SENT', lineSentAt: '2026-10-06' }), TODAY)).toBe('2 天前 · LINE 未回')
  })
  it('describes the latest unanswered call', () => {
    const r = recall({ step: 'CALLED_2', lineSentAt: '2026-10-01', call1At: '2026-10-04', call2At: '2026-10-07' })
    expect(lastContact(r, TODAY)).toBe('昨天 · 未接')
  })
  it('says today for a contact made today', () => {
    expect(lastContact(recall({ step: 'CALLED_1', call1At: TODAY }), TODAY)).toBe('今天 · 未接')
  })
  it('describes a confirmation', () => {
    expect(lastContact(recall({ status: 'CONFIRMED', lineSentAt: '2026-10-01', confirmedAt: '2026-10-04' }), TODAY)).toBe('4 天前 · 已確認')
  })
})

describe('primaryAction', () => {
  it.each([
    [recall(), true, { action: 'LINE_SENT', label: '已傳 LINE' }],
    [recall(), false, { action: 'CALL_NO_ANSWER', label: '第 1 通未接' }],
    [recall({ step: 'LINE_SENT' }), true, { action: 'CALL_NO_ANSWER', label: '第 1 通未接' }],
    [recall({ step: 'CALLED_2' }), true, { action: 'CALL_NO_ANSWER', label: '第 3 通未接' }],
    [recall({ status: 'CONFIRMED' }), true, null],
  ])('%#', (r, hasLine, expected) => expect(primaryAction(r, hasLine)).toEqual(expected))
})

describe('stageLabel', () => {
  it('names the next action kind', () => {
    expect(stageLabel(recall({ nextAction: { action: 'SEND_LINE' } }))).toBe('待傳 LINE')
    expect(stageLabel(recall({ nextAction: { action: 'CALL_2' } }))).toBe('待撥電話')
  })
  it('falls back to the status', () => {
    expect(stageLabel(recall({ status: 'UNREACHABLE' }))).toBe('聯絡不上')
    expect(stageLabel(recall({ onHold: true }))).toBe('待重新追蹤')
  })
})

describe('rescheduleOptions', () => {
  it('postpones from the due date when it is still ahead', () => {
    expect(rescheduleOptions('2026-10-15', TODAY)).toEqual([
      { label: '延後 1 週', date: '2026-10-22' },
      { label: '延後 2 週', date: '2026-10-29' },
      { label: '延後 1 個月', date: '2026-11-15' },
    ])
  })
  it('postpones from today when the due date has passed', () => {
    expect(rescheduleOptions('2026-10-01', TODAY)[0]).toEqual({ label: '延後 1 週', date: '2026-10-15' })
  })
})

describe('formatLongDate', () => {
  it('writes the date with its weekday', () => expect(formatLongDate('2026-10-08')).toBe('2026 年 10 月 8 日 · 星期四'))
})
