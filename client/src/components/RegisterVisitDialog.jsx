import { useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import PatientForm from './PatientForm.jsx'
import { inputClass } from './Field.jsx'
import { useDebouncedValue } from '../hooks/useDebouncedValue.js'
import { useCreatePatient, usePatients, useRecordVisit } from '../hooks/usePatients.js'
import { formatDate, formatPhone } from '../utils/format.js'

function guessInitial(search) {
  const text = search.trim()
  return /^[\d\s-]+$/.test(text) ? { phoneNumber: text } : { name: text }
}

export default function RegisterVisitDialog({ onClose }) {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const term = useDebouncedValue(search.trim(), 300)
  const results = usePatients({ search: term, page: 1 }, { enabled: term.length > 0 })
  const recordVisit = useRecordVisit()
  const createPatient = useCreatePatient()

  if (creating) {
    return (
      <Modal title="新病患" onClose={onClose}>
        <PatientForm
          initial={guessInitial(search)}
          submitLabel="儲存並登記看診"
          pending={createPatient.isPending}
          error={createPatient.error}
          onSubmit={(data) => createPatient.mutate({ ...data, registerVisitToday: true }, { onSuccess: onClose })}
        />
      </Modal>
    )
  }

  const items = term ? results.data?.items ?? [] : []

  return (
    <Modal title="登記今日看診" onClose={onClose}>
      <input
        autoFocus
        className={inputClass}
        placeholder="輸入姓名或電話搜尋"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul className="mt-4 divide-y divide-slate-100">
        {items.map((patient) => (
          <li key={patient.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium">{patient.name}</p>
              <p className="text-sm text-slate-500">{formatPhone(patient.phoneNumber)} · 生日 {formatDate(patient.birthDate)}</p>
            </div>
            <Button
              disabled={recordVisit.isPending}
              onClick={() => recordVisit.mutate({ patientId: patient.id }, { onSuccess: onClose })}
            >
              登記看診
            </Button>
          </li>
        ))}
      </ul>
      {term && results.isSuccess && items.length === 0 && (
        <p className="py-4 text-center text-sm text-slate-500">找不到符合的病患</p>
      )}
      <div className="mt-6 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={() => setCreating(true)}>＋ 新病患</Button>
      </div>
    </Modal>
  )
}
