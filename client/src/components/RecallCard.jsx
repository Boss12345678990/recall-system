import { useNavigate } from 'react-router'
import ProgressDots from './ProgressDots.jsx'
import { useToast } from './Toast.jsx'
import { NEXT_ACTION_LABELS, STATUS_LABELS } from '../labels.js'
import { formatMonthDay, formatPhone } from '../utils/format.js'

export default function RecallCard({ item, children }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { patient, nextAction } = item
  const overdue = nextAction?.overdueDays > 0

  const copyPhone = (event) => {
    event.stopPropagation()
    navigator.clipboard?.writeText(patient.phoneNumber)
    toast.show({ message: '已複製電話' })
  }

  return (
    <article
      onClick={() => navigate(`/patients/${patient.id}`)}
      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{patient.name}</h3>
          <button type="button" onClick={copyPhone} title="點一下複製" className="mt-1 text-slate-500 hover:text-teal-700">
            {formatPhone(patient.phoneNumber)}
          </button>
        </div>
        {overdue ? (
          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-600">逾期 {nextAction.overdueDays} 天</span>
        ) : (
          <span className="text-sm text-slate-500">回診日 {formatMonthDay(item.dueDate)}</span>
        )}
      </div>

      <div className="mt-5 flex items-center gap-8">
        <ProgressDots recall={item} hasLine={patient.hasLine} />
        <span className="font-medium">{nextAction ? NEXT_ACTION_LABELS[nextAction.action] : STATUS_LABELS[item.status]}</span>
      </div>

      {children && (
        <div className="mt-5 flex justify-end gap-3" onClick={(event) => event.stopPropagation()}>
          {children}
        </div>
      )}
    </article>
  )
}
