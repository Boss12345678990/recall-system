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

// Most urgent first = smallest countdown: the earliest due date (overdue ones first).
// Ties go to the later contact step (call 3 > call 2 > call 1 > LINE), then to the name.
export function compareUrgency(a, b) {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  const byRank = ACTION_RANK[b.nextAction.action] - ACTION_RANK[a.nextAction.action]
  if (byRank !== 0) return byRank
  return a.patient.name.localeCompare(b.patient.name, 'zh-Hant-TW')
}

export function buildTodayItems(items, settings, today) {
  return items
    .map((item) => withNextAction(item, item.patient.hasLine, settings, today))
    .filter((item) => item.nextAction && item.nextAction.actionDate <= today)
    .sort(compareUrgency)
}

export const MUTABLE_FIELDS = [
  'dueDate', 'step', 'status', 'lineSentAt', 'call1At', 'call2At', 'call3At', 'confirmedAt', 'onHold',
]

const NEXT_CALL_STEP = { LINE_SENT: 'CALLED_1', CALLED_1: 'CALLED_2', CALLED_2: 'CALLED_3' }

export function snapshot(recall) {
  return Object.fromEntries(MUTABLE_FIELDS.map((field) => [field, recall[field]]))
}

export function applyAction(recall, hasLine, action, today) {
  if (recall.status !== 'PENDING' || recall.onHold) return null
  if (action === 'CONFIRM') return { status: 'CONFIRMED', confirmedAt: today }
  if (action === 'LINE_SENT') {
    return recall.step === 'NOT_CONTACTED' && hasLine ? { step: 'LINE_SENT', lineSentAt: today } : null
  }
  if (action === 'CALL_NO_ANSWER') {
    const nextStep = recall.step === 'NOT_CONTACTED' && !hasLine ? 'CALLED_1' : NEXT_CALL_STEP[recall.step]
    if (!nextStep) return null
    const patch = { step: nextStep, [STEP_DATE_FIELD[nextStep]]: today }
    if (nextStep === 'CALLED_3') patch.status = 'UNREACHABLE'
    return patch
  }
  return null
}

export function applyManualEdit(recall, changes, today) {
  if (recall.status === 'COMPLETED') return { error: 'RECALL_COMPLETED' }
  const next = snapshot(recall)
  if (changes.dueDate !== undefined) {
    next.dueDate = changes.dueDate
    // A held import becomes trackable again once staff give it a due date that has not passed.
    if (next.onHold && changes.dueDate >= today) next.onHold = false
  }
  if (changes.step !== undefined && changes.step !== recall.step) {
    const target = STEPS.indexOf(changes.step)
    STEPS.forEach((step, index) => {
      const field = STEP_DATE_FIELD[step]
      if (!field) return
      if (index > target) next[field] = null
      else if (!next[field]) next[field] = today
    })
    next.step = changes.step
    if (changes.step === 'CALLED_3' && changes.status === undefined && next.status === 'PENDING') {
      next.status = 'UNREACHABLE'
    }
  }
  if (changes.status !== undefined && changes.status !== recall.status) {
    next.status = changes.status
    if (changes.status === 'CONFIRMED') next.confirmedAt = today
  }
  if (next.status === 'PENDING' && next.step === 'CALLED_3') return { error: 'PENDING_AT_CALLED_3' }
  return { patch: next }
}

// Restart doubles as 改約 (reschedule): any open recall can start over toward a new due date.
export function canRestart(recall) {
  return recall.status !== 'COMPLETED'
}

export function restartFields(dueDate) {
  return {
    dueDate, step: 'NOT_CONTACTED', status: 'PENDING', lineSentAt: null,
    call1At: null, call2At: null, call3At: null, confirmedAt: null, onHold: false,
  }
}
