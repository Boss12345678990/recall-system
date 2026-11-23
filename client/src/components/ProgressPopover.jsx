import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NEXT_ACTION_LABELS } from '../labels.js'
import { PROGRESS_STEPS } from '../utils/recallActions.js'
import { formatDate } from '../utils/format.js'

const PANEL_WIDTH = 300
const PANEL_GAP = 6
// Room needed below the trigger before the panel flips above it.
const PANEL_MIN_SPACE = 220
// Grace period so the pointer can cross the gap from the cell onto the panel.
const CLOSE_DELAY_MS = 150

const STEP_OF_NEXT_ACTION = { SEND_LINE: 'LINE_SENT', CALL_1: 'CALLED_1', CALL_2: 'CALLED_2', CALL_3: 'CALLED_3' }

function stepRows(recall, hasLine) {
  const nextStep = recall.nextAction && STEP_OF_NEXT_ACTION[recall.nextAction.action]
  return PROGRESS_STEPS.map((step) => {
    const date = recall[step.field]
    if (date) return { key: step.key, name: step.name, value: formatDate(date), tone: 'done' }
    if (step.key === 'LINE_SENT' && !hasLine) return { key: step.key, name: step.name, value: '未加 LINE（略過）', tone: 'skipped' }
    if (step.key === nextStep) return { key: step.key, name: step.name, value: `預計 ${formatDate(recall.nextAction.actionDate)}`, tone: 'next' }
    return { key: step.key, name: step.name, value: '尚未進行', tone: 'todo' }
  })
}

const DOT_TONES = {
  done: 'bg-orange-500',
  next: 'border-2 border-orange-400 bg-white',
  skipped: 'border border-dashed border-slate-300 bg-white',
  todo: 'border-2 border-slate-200 bg-white',
}

function PanelContent({ recall, hasLine }) {
  const next = recall.nextAction
  return (
    <>
      <p className="mb-2 text-xs font-semibold text-slate-700">提醒進度</p>
      <ol className="space-y-1.5">
        {stepRows(recall, hasLine).map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-xs">
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_TONES[row.tone]}`} />
            <span className="w-20 shrink-0 text-slate-500">{row.name}</span>
            <span className={`font-mono ${row.tone === 'done' ? 'text-slate-800' : row.tone === 'next' ? 'text-orange-600' : 'text-slate-400'}`}>
              {row.value}
            </span>
          </li>
        ))}
        {recall.confirmedAt && (
          <li className="flex items-center gap-2 text-xs">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-600" />
            <span className="w-20 shrink-0 text-slate-500">確認複診</span>
            <span className="font-mono text-slate-800">{formatDate(recall.confirmedAt)}</span>
          </li>
        )}
      </ol>
      {next && (
        <div className="mt-3 border-t border-slate-100 pt-2 text-xs">
          <p className={next.overdueDays > 0 ? 'font-medium text-red-600' : 'font-medium text-orange-700'}>
            下一步：{NEXT_ACTION_LABELS[next.action]}（{formatDate(next.actionDate)}
            {next.overdueDays > 0 ? `，已逾 ${next.overdueDays} 天` : ''}）
          </p>
        </div>
      )}
    </>
  )
}

// Wraps the progress cell; hovering or focusing it shows every contact step with its date.
// The panel stays open while the pointer is on it, and closes on scroll or Escape.
// It is portalled to <body> with fixed positioning so the table's scroll container can't clip it.
export default function ProgressPopover({ recall, hasLine, children }) {
  const triggerRef = useRef(null)
  const closeTimer = useRef(null)
  const [position, setPosition] = useState(null)
  const panelId = useId()
  const isOpen = position !== null

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!isOpen) return undefined
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [isOpen])

  function cancelClose() {
    clearTimeout(closeTimer.current)
  }

  function scheduleClose() {
    cancelClose()
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS)
  }

  function open() {
    cancelClose()
    if (isOpen) return
    const rect = triggerRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8))
    const below = window.innerHeight - rect.bottom >= PANEL_MIN_SPACE
    setPosition(below
      ? { left, top: rect.bottom + PANEL_GAP }
      : { left, bottom: window.innerHeight - rect.top + PANEL_GAP })
  }

  function close() {
    cancelClose()
    setPosition(null)
  }

  return (
    <div
      ref={triggerRef}
      tabIndex={0}
      aria-describedby={isOpen ? panelId : undefined}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={close}
      onKeyDown={(event) => event.key === 'Escape' && close()}
      className="-mx-1.5 -my-1 inline-block cursor-default rounded-md px-1.5 py-1 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"
    >
      {children}
      {isOpen && createPortal(
        <div
          id={panelId}
          role="tooltip"
          style={{ ...position, width: PANEL_WIDTH }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="fixed z-50 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <PanelContent recall={recall} hasLine={hasLine} />
        </div>,
        document.body,
      )}
    </div>
  )
}
