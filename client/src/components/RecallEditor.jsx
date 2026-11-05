import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import Field, { inputClass } from './Field.jsx'
import { STATUS_LABELS, STEP_LABELS } from '../labels.js'
import { useEditRecall } from '../hooks/useRecalls.js'

const EDITABLE_STATUSES = ['PENDING', 'CONFIRMED', 'UNREACHABLE']

function initialForm(recall) {
  return { step: recall.step, status: recall.status, dueDate: recall.dueDate, note: '' }
}

export default function RecallEditor({ recall }) {
  const edit = useEditRecall()
  const [form, setForm] = useState(initialForm(recall))

  useEffect(() => setForm(initialForm(recall)), [recall])

  const changes = {}
  if (form.step !== recall.step) changes.step = form.step
  if (form.status !== recall.status) changes.status = form.status
  if (form.dueDate !== recall.dueDate) changes.dueDate = form.dueDate
  const dirty = Object.keys(changes).length > 0

  const submit = (event) => {
    event.preventDefault()
    edit.mutate({ id: recall.id, ...changes, note: form.note.trim() || undefined, version: recall.version })
  }

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="步驟">
          <select className={inputClass} value={form.step} onChange={update('step')}>
            {Object.entries(STEP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="狀態">
          <select className={inputClass} value={form.status} onChange={update('status')}>
            {EDITABLE_STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select>
        </Field>
        <Field label="回診日">
          <input className={inputClass} type="date" required value={form.dueDate} onChange={update('dueDate')} />
        </Field>
      </div>
      <Field label="備註（選填）">
        <input className={inputClass} value={form.note} onChange={update('note')} placeholder="例：病患說下個月再約" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={!dirty || edit.isPending}>儲存變更</Button>
      </div>
    </form>
  )
}
