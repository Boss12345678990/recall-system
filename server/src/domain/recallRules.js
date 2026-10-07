import { addDays, diffDays } from '../lib/dates.js'

export const STEPS = ['NOT_CONTACTED', 'LINE_SENT', 'CALLED_1', 'CALLED_2', 'CALLED_3']

export const STEP_DATE_FIELD = {
  LINE_SENT: 'lineSentAt',
  CALLED_1: 'call1At',
  CALLED_2: 'call2At',
  CALLED_3: 'call3At',
}

const ACTION_RANK = { CALL_3: 4, CALL_2: 3, CALL_1: 2, SEND_LINE: 1 }

export function nextAction(recall, hasLine, settings) {
  if (recall.status !== 'PENDING' || recall.onHold) return null
  switch (recall.step) {
    case 'NOT_CONTACTED':
      return { action: hasLine ? 'SEND_LINE' : 'CALL_1', actionDate: addDays(recall.dueDate, -settings.lineLeadDays) }
    case 'LINE_SENT':
      return { action: 'CALL_1', actionDate: addDays(recall.lineSentAt, settings.callAfterLineDays) }
    case 'CALLED_1':
      return { action: 'CALL_2', actionDate: addDays(recall.call1At, settings.callGapDays) }
    case 'CALLED_2':
      return { action: 'CALL_3', actionDate: addDays(recall.call2At, settings.callGapDays) }
    default:
      return null
  }
}

export function overdueDays(actionDate, today) {
  return Math.max(0, diffDays(today, actionDate))
}

export function withNextAction(recall, hasLine, settings, today) {
  const next = nextAction(recall, hasLine, settings)
  return { ...recall, nextAction: next && { ...next, overdueDays: overdueDays(next.actionDate, today) } }
}

export function compareUrgency(a, b) {
  const aOverdue = a.nextAction.overdueDays > 0
  const bOverdue = b.nextAction.overdueDays > 0
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
  const byRank = ACTION_RANK[b.nextAction.action] - ACTION_RANK[a.nextAction.action]
  if (byRank !== 0) return byRank
  const byOverdue = b.nextAction.overdueDays - a.nextAction.overdueDays
  if (byOverdue !== 0) return byOverdue
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  return a.patient.name.localeCompare(b.patient.name, 'zh-Hant-TW')
}

export function buildTodayItems(items, settings, today) {
  return items
    .map((item) => withNextAction(item, item.patient.hasLine, settings, today))
    .filter((item) => item.nextAction && item.nextAction.actionDate <= today)
    .sort(compareUrgency)
}
