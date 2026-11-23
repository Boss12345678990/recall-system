import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import Button from '../components/Button.jsx'
import Modal from '../components/Modal.jsx'
import PageMessage from '../components/PageMessage.jsx'
import PatientForm from '../components/PatientForm.jsx'
import { inputClass } from '../components/Field.jsx'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import { useCreatePatient, usePatients } from '../hooks/usePatients.js'
import { STATUS_LABELS, STEP_LABELS } from '../labels.js'
import { formatDate, formatPhone } from '../utils/format.js'

const STATUS_FILTERS = [['', '全部狀態'], ['PENDING', '未確認'], ['CONFIRMED', '確認複診'], ['UNREACHABLE', '聯絡不上']]
const HEADERS = ['病患', '生日', '預計回診日', '狀態', '提醒進度']

export default function PatientsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const term = useDebouncedValue(search.trim(), 300)
  const query = usePatients({ search: term, status, page })
  const createPatient = useCreatePatient()

  useEffect(() => setPage(1), [term, status])

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize)) : 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">病患名冊</h1>
        <div className="flex gap-3">
          <Link to="/import" className="whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            匯入 Excel
          </Link>
          <Button onClick={() => setCreating(true)}>＋ 新增病患</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input className={`${inputClass} max-w-xs`} placeholder="搜尋姓名、電話或生日" value={search}
          onChange={(event) => setSearch(event.target.value)} />
        <select className={`${inputClass} w-auto`} value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {query.isPending && <PageMessage>載入中…</PageMessage>}
      {query.isError && <PageMessage tone="error">{query.error.message}</PageMessage>}
      {query.isSuccess && query.data.items.length === 0 && <PageMessage>沒有符合的病患</PageMessage>}

      {query.isSuccess && query.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="text-xs text-slate-400">
                {HEADERS.map((header, index) => (
                  <th key={header} className={`py-3 font-normal ${index === 0 ? 'pl-5 pr-3' : 'px-3'}`}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((patient) => {
                const recall = patient.currentRecall
                return (
                  <tr key={patient.id} onClick={() => navigate(`/patients/${patient.id}`)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-orange-50/40">
                    <td className="py-3 pl-5 pr-3">
                      <Link to={`/patients/${patient.id}`} className="font-semibold text-slate-800 hover:text-orange-600">{patient.name}</Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono">{formatPhone(patient.phoneNumber)}</span>
                        {patient.comment && <span className="max-w-48 truncate" title={patient.comment}>{patient.comment}</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-slate-600">{formatDate(patient.birthDate)}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-slate-700">{recall ? formatDate(recall.dueDate) : '—'}</td>
                    <td className="px-3 py-3 text-sm">{recall ? STATUS_LABELS[recall.status] : <span className="text-slate-400">尚無回診追蹤</span>}</td>
                    <td className="px-3 py-3 text-sm text-slate-600">{recall ? STEP_LABELS[recall.step] : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</Button>
          <span className="text-slate-500">第 {page} / {totalPages} 頁</span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一頁</Button>
        </div>
      )}

      {creating && (
        <Modal title="新增病患" onClose={() => setCreating(false)}>
          <PatientForm
            submitLabel="儲存"
            registerVisitOption
            pending={createPatient.isPending}
            error={createPatient.error}
            onSubmit={(data, { registerVisit }) =>
              createPatient.mutate({ ...data, registerVisitToday: registerVisit }, {
                onSuccess: (patient) => navigate(`/patients/${patient.id}`),
              })}
          />
        </Modal>
      )}
    </div>
  )
}
