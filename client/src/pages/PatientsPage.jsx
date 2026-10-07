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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold">客人</h1>
        <input className={`${inputClass} max-w-xs`} placeholder="姓名、電話或生日" value={search}
          onChange={(event) => setSearch(event.target.value)} />
        <select className={`${inputClass} w-auto`} value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button className="ml-auto" onClick={() => setCreating(true)}>＋ 新增客人</Button>
      </div>

      {query.isPending && <PageMessage>載入中…</PageMessage>}
      {query.isError && <PageMessage tone="error">{query.error.message}</PageMessage>}
      {query.isSuccess && query.data.items.length === 0 && <PageMessage>沒有符合的客人</PageMessage>}

      {query.isSuccess && query.data.items.length > 0 && (
        <ul className="space-y-3">
          {query.data.items.map((patient) => (
            <li key={patient.id}>
              <Link to={`/patients/${patient.id}`}
                className="flex items-center justify-between gap-6 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm transition hover:shadow-md">
                <div>
                  <p className="font-semibold">{patient.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{formatPhone(patient.phoneNumber)} · 生日 {formatDate(patient.birthDate)}</p>
                </div>
                {patient.currentRecall ? (
                  <div className="text-right text-sm">
                    <p className="font-medium">{STATUS_LABELS[patient.currentRecall.status]}</p>
                    <p className="mt-1 text-slate-500">
                      回診日 {formatDate(patient.currentRecall.dueDate)} · {STEP_LABELS[patient.currentRecall.step]}
                    </p>
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">尚無回診追蹤</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</Button>
          <span className="text-slate-500">第 {page} / {totalPages} 頁</span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一頁</Button>
        </div>
      )}

      {creating && (
        <Modal title="新增客人" onClose={() => setCreating(false)}>
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
