import { useState } from 'react'
import { Link } from 'react-router'
import Button from './Button.jsx'
import Field, { inputClass } from './Field.jsx'

const EMPTY = { name: '', birthDate: '', phoneNumber: '', hasLine: true, comment: '' }

export default function PatientForm({ initial = {}, submitLabel, onSubmit, pending = false, error, registerVisitOption = false }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial, comment: initial.comment ?? '' })
  const [registerVisit, setRegisterVisit] = useState(true)

  const fieldErrors = Array.isArray(error?.details) ? error.details : []
  const fieldError = (field) => fieldErrors.find((detail) => detail.field === field)?.message
  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = (event) => {
    event.preventDefault()
    const { name, birthDate, phoneNumber, hasLine, comment } = form
    onSubmit({ name: name.trim(), birthDate, phoneNumber, hasLine, comment: comment.trim() || null }, { registerVisit })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="姓名" error={fieldError('name')}>
          <input className={inputClass} required value={form.name} onChange={update('name')} />
        </Field>
        <Field label="生日" error={fieldError('birthDate')}>
          <input className={inputClass} type="date" required value={form.birthDate} onChange={update('birthDate')} />
        </Field>
        <Field label="電話" error={fieldError('phoneNumber')}>
          <input className={inputClass} required inputMode="tel" value={form.phoneNumber} onChange={update('phoneNumber')} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.hasLine} onChange={update('hasLine')} className="h-4 w-4 accent-teal-600" />
          有加 LINE
        </label>
      </div>
      <Field label="備註" error={fieldError('comment')}>
        <textarea className={inputClass} rows={2} value={form.comment} onChange={update('comment')} />
      </Field>
      {registerVisitOption && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={registerVisit} onChange={(e) => setRegisterVisit(e.target.checked)} className="h-4 w-4 accent-teal-600" />
          同時登記今日看診
        </label>
      )}
      {error && fieldErrors.length === 0 && (
        <p className="text-sm text-red-600">
          {error.message}
          {error.code === 'PATIENT_DUPLICATE' && (
            <Link to={`/patients/${error.details.existingPatientId}`} className="ml-2 underline">查看這位客人</Link>
          )}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? '儲存中…' : submitLabel}</Button>
      </div>
    </form>
  )
}
