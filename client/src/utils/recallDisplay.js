import dayjs from 'dayjs'
import { STATUS_LABELS } from '../labels.js'
import { allowedActions } from './recallActions.js'

const FORMAT = 'YYYY-MM-DD'
const WEEKDAYS = '日一二三四五六'

function daysBetween(later, earlier) {
  return dayjs(later).diff(dayjs(earlier), 'day')
}

function daysAgo(date, today) {
  const days = daysBetween(today, date)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  return `${days} 天前`
}

export function formatLongDate(date) {
  const d = dayjs(date)
  return `${d.year()} 年 ${d.month() + 1} 月 ${d.date()} 日 · 星期${WEEKDAYS[d.day()]}`
}

// Days until the recall's due date: red once due, orange within 3 days.
export function countdown(dueDate, today) {
  const days = daysBetween(dueDate, today)
  if (days < 0) return { label: `逾期 ${-days} 天`, tone: 'danger' }
  if (days === 0) return { label: '今天', tone: 'danger' }
  return { label: `還有 ${days} 天`, tone: days <= 3 ? 'warning' : 'muted' }
}

export function lastContact(recall, today) {
  if (recall.status === 'CONFIRMED' && recall.confirmedAt) return `${daysAgo(recall.confirmedAt, today)} · 已確認`
  const lastCall = recall.call3At ?? recall.call2At ?? recall.call1At
  if (lastCall) return `${daysAgo(lastCall, today)} · 未接`
  if (recall.lineSentAt) return `${daysAgo(recall.lineSentAt, today)} · LINE 未回`
  return null
}

const NEXT_CALL_NUMBER = { NOT_CONTACTED: 1, LINE_SENT: 1, CALLED_1: 2, CALLED_2: 3 }

// The one contact staff record from the row: LINE sent, or the Nth unanswered call.
export function primaryAction(recall, hasLine) {
  const actions = allowedActions(recall, hasLine)
  if (actions.includes('LINE_SENT')) return { action: 'LINE_SENT', label: '已傳 LINE' }
  if (actions.includes('CALL_NO_ANSWER')) {
    return { action: 'CALL_NO_ANSWER', label: `第 ${NEXT_CALL_NUMBER[recall.step]} 通未接` }
  }
  return null
}

export function stageLabel(recall) {
  if (recall.nextAction) return recall.nextAction.action === 'SEND_LINE' ? '待傳 LINE' : '待撥電話'
  if (recall.onHold) return '待重新追蹤'
  return STATUS_LABELS[recall.status]
}

// Postpone from the due date, or from today if the due date has already passed.
export function rescheduleOptions(dueDate, today) {
  const base = dayjs(dueDate > today ? dueDate : today)
  return [
    { label: '延後 1 週', date: base.add(7, 'day').format(FORMAT) },
    { label: '延後 2 週', date: base.add(14, 'day').format(FORMAT) },
    { label: '延後 1 個月', date: base.add(1, 'month').format(FORMAT) },
  ]
}
