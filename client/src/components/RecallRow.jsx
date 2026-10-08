import { Link } from 'react-router'
import ProgressDots from './ProgressDots.jsx'
import { countdown, lastContact, stageLabel } from '../utils/recallDisplay.js'
import { formatDate, formatPhone } from '../utils/format.js'

const BADGE_TONES = {
  danger: 'border-red-200 bg-red-50 text-red-600',
  warning: 'border-orange-200 bg-orange-50 text-orange-600',
  muted: 'border-slate-200 bg-slate-50 text-slate-500',
}

export default function RecallRow({ item, today, children }) {
  const { patient } = item
  const badge = countdown(item.dueDate, today)
  const contact = lastContact(item, today)

  return (
    <tr className="border-t border-slate-100 align-middle">
      <td className="py-3 pl-5 pr-3">
        <Link to={`/patients/${patient.id}`} className="font-semibold text-slate-800 hover:text-orange-600">
          {patient.name}
        </Link>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
          <span className="font-mono">{formatPhone(patient.phoneNumber)}</span>
          {patient.comment && <span className="max-w-40 truncate" title={patient.comment}>{patient.comment}</span>}
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-slate-700">{formatDate(item.dueDate)}</td>
      <td className="px-3 py-3">
        <span className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${BADGE_TONES[badge.tone]}`}>
          {badge.label}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <ProgressDots recall={item} hasLine={patient.hasLine} compact />
          <span className="text-xs text-slate-600">{stageLabel(item)}</span>
        </div>
        {contact && <p className="mt-1 text-xs text-slate-400">{contact}</p>}
      </td>
      {children}
    </tr>
  )
}
