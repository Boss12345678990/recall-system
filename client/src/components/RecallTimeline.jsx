import { NEXT_ACTION_LABELS } from '../labels.js'
import { PROGRESS_STEPS } from '../utils/recallActions.js'
import { formatDate } from '../utils/format.js'

export default function RecallTimeline({ recall, hasLine }) {
  const rows = [
    { label: '回診日', value: formatDate(recall.dueDate), done: true },
    ...PROGRESS_STEPS.map((step) => {
      const date = recall[step.field]
      const skipped = step.key === 'LINE_SENT' && !hasLine
      return { label: step.name, value: skipped ? '未加 LINE' : date ? formatDate(date) : '尚未進行', done: Boolean(date) }
    }),
  ]
  if (recall.confirmedAt) rows.push({ label: '確認複診', value: formatDate(recall.confirmedAt), done: true })

  return (
    <div>
      <ol className="space-y-3 border-l-2 border-slate-100 pl-5">
        {rows.map((row) => (
          <li key={row.label} className="relative">
            <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ${row.done ? 'bg-teal-500' : 'border-2 border-slate-300 bg-white'}`} />
            <span className="text-sm text-slate-500">{row.label}</span>
            <span className="ml-3">{row.value}</span>
          </li>
        ))}
      </ol>
      {recall.nextAction && (
        <p className="mt-4 text-sm font-medium text-teal-700">
          下一步：{NEXT_ACTION_LABELS[recall.nextAction.action]}（{formatDate(recall.nextAction.actionDate)}）
        </p>
      )}
    </div>
  )
}
