import { useState } from 'react'
import Button from './Button.jsx'
import Field, { inputClass } from './Field.jsx'
import Modal from './Modal.jsx'
import { formatDate } from '../utils/format.js'

// The recall's due date is only the expected one; confirming asks for the date the patient agreed to.
export default function ConfirmRecallDialog({ item, today, onConfirm, onCancel }) {
  const [dueDate, setDueDate] = useState(item.dueDate >= today ? item.dueDate : today)

  return (
    <Modal title="確認複診" onClose={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm(dueDate)
        }}
      >
        <p className="mb-5 text-sm text-slate-600">
          {item.patient.name}・預計回診日 <span className="font-mono">{formatDate(item.dueDate)}</span>
        </p>
        <Field label="確認的回診日" hint="請填入病患答應回診的日期">
          <input type="date" required min={today} value={dueDate}
            onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
        </Field>
        <div className="mt-8 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>
          <Button type="submit" variant="success">✓ 確認複診</Button>
        </div>
      </form>
    </Modal>
  )
}
