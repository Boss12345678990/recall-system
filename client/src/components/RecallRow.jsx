import { Link, useNavigate } from 'react-router'
import ProgressDots from './ProgressDots.jsx'
import ProgressPopover from './ProgressPopover.jsx'
import { countdown, lastContact, stageLabel, waitingLabel } from '../utils/recallDisplay.js'
import { formatDate, formatPhone } from '../utils/format.js'

const BADGE_TONES = {
  danger: 'border-red-200 bg-red-50 text-red-600',
  warning: 'border-orange-200 bg-orange-50 text-orange-600',
  muted: 'border-slate-200 bg-slate-50 text-slate-500',
}

// Done-today and waiting rows look like any other row: the 待辦 sub-tabs already separate them.
// Clicking anywhere on the row opens the patient. `compact` drops the countdown and
// progress columns (已確認 tab), marking past-due dates inline instead.
export default function RecallRow({ item, today, compact = false, children }) {
  const navigate = useNavigate()
  const { patient } = item
  const badge = countdown(item.dueDate, today)
  const contact = lastContact(item, today)
  const patientPath = `/patients/${patient.id}`

  return (
    <tr
      onClick={() => navigate(patientPath)}
      className="cursor-pointer border-t border-slate-100 align-middle hover:bg-orange-50/40"
    >
      <td className="py-3 pl-5 pr-3">
        <Link to={patientPath} onClick={(event) => event.stopPropagation()} className="font-semibold text-slate-800 hover:text-orange-600">
          {patient.name}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
          <span className="font-mono">{formatPhone(patient.phoneNumber)}</span>
          {patient.comment && <span className="max-w-40 truncate" title={patient.comment}>{patient.comment}</span>}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-slate-700">{formatDate(item.visitDate) || '—'}</td>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-slate-700">
        {formatDate(item.dueDate)}
        {compact && item.dueDate < today && (
          <span className={`ml-2 rounded-md border px-2 py-0.5 font-sans text-xs font-medium ${BADGE_TONES.danger}`}>逾期</span>
        )}
      </td>
      {!compact && (
        <>
          <td className="px-3 py-3">
            <span className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${BADGE_TONES[badge.tone]}`}>
              {badge.label}
            </span>
          </td>
          <td className="px-3 py-3">
            <ProgressPopover recall={item} hasLine={patient.hasLine}>
              <div className="flex items-center gap-3">
                <ProgressDots recall={item} hasLine={patient.hasLine} compact />
                <span className="text-xs text-slate-600">{item.waiting ? waitingLabel(item, today) : stageLabel(item)}</span>
              </div>
              {contact && <p className="mt-1 text-xs text-slate-400">{contact}</p>}
            </ProgressPopover>
          </td>
        </>
      )}
      {children}
    </tr>
  )
}
