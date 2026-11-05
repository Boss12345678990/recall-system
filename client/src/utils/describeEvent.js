import { ACTION_LABELS, EVENT_TYPE_LABELS, STATUS_LABELS, STEP_LABELS } from '../labels.js'
import { formatDate } from './format.js'

export function describeEvent(event) {
  const title = event.type === 'ACTION' ? ACTION_LABELS[event.action] : EVENT_TYPE_LABELS[event.type]
  const { before, after } = event
  const lines = []
  if (before.step !== after.step) lines.push(`步驟：${STEP_LABELS[before.step]} → ${STEP_LABELS[after.step]}`)
  if (before.status !== after.status) lines.push(`狀態：${STATUS_LABELS[before.status]} → ${STATUS_LABELS[after.status]}`)
  if (before.dueDate !== after.dueDate) lines.push(`回診日：${formatDate(before.dueDate)} → ${formatDate(after.dueDate)}`)
  if (event.note) lines.push(`備註：${event.note}`)
  return { title, lines }
}
