import { PROGRESS_STEPS } from '../utils/recallActions.js'
import { formatMonthDay } from '../utils/format.js'

function dotTitle(step, date, skipped) {
  if (skipped) return '未加 LINE'
  return `${step.name} ${date ? formatMonthDay(date) : '尚未進行'}`
}

// One dot per contact step (LINE → call 1 → 2 → 3); hovering a dot shows its date.
// `compact` is the small inline version used in table rows, where ProgressPopover shows the dates instead.
export default function ProgressDots({ recall, hasLine, compact = false }) {
  const steps = PROGRESS_STEPS.map((step) => {
    const date = recall[step.field]
    const skipped = step.key === 'LINE_SENT' && !hasLine
    return { step, date, skipped, title: dotTitle(step, date, skipped) }
  })

  if (compact) {
    return (
      <ol className="flex items-center gap-1" aria-label="聯絡進度">
        {steps.map(({ step, date, skipped }) => (
          <li key={step.key}>
            <span
              data-done={Boolean(date)}
              className={`block h-2 w-2 rounded-full ${date ? 'bg-orange-500' : skipped ? 'border border-dashed border-slate-300' : 'bg-orange-100'}`}
            />
          </li>
        ))}
      </ol>
    )
  }

  return (
    <ol className="flex items-start" aria-label="聯絡進度">
      {steps.map(({ step, date, skipped, title }, index) => (
        <li key={step.key} className="flex items-start">
          {index > 0 && <span aria-hidden className={`mt-1.5 h-0.5 w-8 ${date ? 'bg-orange-500' : 'bg-slate-200'}`} />}
          <span className="flex flex-col items-center gap-1">
            <span
              title={title}
              data-done={Boolean(date)}
              className={`h-3.5 w-3.5 rounded-full border-2 ${date ? 'border-orange-500 bg-orange-500' : skipped ? 'border-dashed border-slate-300 bg-white' : 'border-slate-300 bg-white'}`}
            />
            <span className="text-xs text-slate-400">{step.short}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
