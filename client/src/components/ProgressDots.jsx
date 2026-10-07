import { PROGRESS_STEPS } from '../utils/recallActions.js'
import { formatMonthDay } from '../utils/format.js'

export default function ProgressDots({ recall, hasLine }) {
  return (
    <ol className="flex items-start" aria-label="聯絡進度">
      {PROGRESS_STEPS.map((step, index) => {
        const date = recall[step.field]
        const skipped = step.key === 'LINE_SENT' && !hasLine
        const title = skipped ? '未加 LINE' : `${step.name} ${date ? formatMonthDay(date) : '尚未進行'}`
        const dotClass = date
          ? 'border-teal-500 bg-teal-500'
          : skipped ? 'border-dashed border-slate-300 bg-white' : 'border-slate-300 bg-white'
        return (
          <li key={step.key} className="flex items-start">
            {index > 0 && <span aria-hidden className={`mt-1.5 h-0.5 w-8 ${date ? 'bg-teal-500' : 'bg-slate-200'}`} />}
            <span className="flex flex-col items-center gap-1">
              <span title={title} data-done={Boolean(date)} className={`h-3.5 w-3.5 rounded-full border-2 ${dotClass}`} />
              <span className="text-xs text-slate-400">{step.short}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
