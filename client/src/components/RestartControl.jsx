import { useState } from 'react'
import Button from './Button.jsx'
import { inputClass } from './Field.jsx'
import { todayLocal } from '../utils/format.js'

export default function RestartControl({ defaultDate, onRestart, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(defaultDate)

  if (!open) {
    return (
      <Button variant="secondary" disabled={disabled} onClick={() => { setDate(defaultDate); setOpen(true) }}>
        重新追蹤
      </Button>
    )
  }

  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onRestart(date)
        setOpen(false)
      }}
    >
      <label htmlFor="restart-due-date" className="text-sm text-slate-600">新的回診日</label>
      <input id="restart-due-date" type="date" required min={todayLocal()} value={date}
        onChange={(event) => setDate(event.target.value)} className={`${inputClass} w-auto`} />
      <Button type="submit" disabled={disabled}>確定</Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
    </form>
  )
}
