// Mirrors applyAction in server/src/domain/recallRules.js.
const CALLABLE_STEPS = new Set(['LINE_SENT', 'CALLED_1', 'CALLED_2'])

export function allowedActions(recall, hasLine) {
  if (recall.status !== 'PENDING' || recall.onHold) return []
  const actions = []
  if (recall.step === 'NOT_CONTACTED' && hasLine) actions.push('LINE_SENT')
  if (CALLABLE_STEPS.has(recall.step) || (recall.step === 'NOT_CONTACTED' && !hasLine)) actions.push('CALL_NO_ANSWER')
  actions.push('CONFIRM')
  return actions
}

export const PROGRESS_STEPS = [
  { key: 'LINE_SENT', short: 'LINE', field: 'lineSentAt', name: '傳 LINE' },
  { key: 'CALLED_1', short: '1', field: 'call1At', name: '第 1 次電話' },
  { key: 'CALLED_2', short: '2', field: 'call2At', name: '第 2 次電話' },
  { key: 'CALLED_3', short: '3', field: 'call3At', name: '第 3 次電話' },
]
