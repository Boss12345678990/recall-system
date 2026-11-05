import { useState } from 'react'
import { useNavigate } from 'react-router'
import Button from './Button.jsx'
import DropdownMenu, { MenuItem } from './DropdownMenu.jsx'
import { allowedActions } from '../utils/recallActions.js'
import { primaryAction, rescheduleOptions } from '../utils/recallDisplay.js'

function RescheduleMenu({ label, dueDate, today, disabled, onReschedule }) {
  const [custom, setCustom] = useState('')
  return (
    <DropdownMenu label={label} disabled={disabled}>
      {(close) => (
        <>
          {rescheduleOptions(dueDate, today).map((option) => (
            <MenuItem key={option.label} onClick={() => { close(); onReschedule(option.date) }}>
              {option.label}
            </MenuItem>
          ))}
          <form
            className="mt-1 flex items-center gap-2 border-t border-slate-100 px-3 pb-2 pt-3"
            onSubmit={(event) => {
              event.preventDefault()
              close()
              onReschedule(custom)
            }}
          >
            <label htmlFor="reschedule-custom" className="sr-only">自訂日期</label>
            <input id="reschedule-custom" type="date" required min={today} value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs" />
            <Button type="submit" size="sm">確定</Button>
          </form>
        </>
      )}
    </DropdownMenu>
  )
}

export default function RecallRowActions({
  item, today, showPrimary = true, disabled = false, onAction, onReschedule, onMarkUnreachable,
}) {
  const navigate = useNavigate()
  const hasLine = item.patient.hasLine
  const primary = showPrimary ? primaryAction(item, hasLine) : null
  const canConfirm = allowedActions(item, hasLine).includes('CONFIRM')
  const restartLabel = item.status === 'UNREACHABLE' || item.onHold ? '重新追蹤' : '改約'

  return (
    <div className="flex items-center justify-end gap-2">
      {primary && (
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAction(primary.action)}>
          {primary.label}
        </Button>
      )}
      {canConfirm && (
        <Button variant="success" size="sm" disabled={disabled} onClick={() => onAction('CONFIRM')}>
          ✓ 確認
        </Button>
      )}
      <RescheduleMenu label={restartLabel} dueDate={item.dueDate} today={today} disabled={disabled} onReschedule={onReschedule} />
      <DropdownMenu label="···" ariaLabel="···" caret={false}>
        {(close) => (
          <>
            <MenuItem onClick={() => { close(); navigate(`/patients/${item.patient.id}`) }}>查看病患資料</MenuItem>
            {item.status !== 'UNREACHABLE' && (
              <MenuItem tone="danger" onClick={() => { close(); onMarkUnreachable() }}>標記為聯絡不上</MenuItem>
            )}
          </>
        )}
      </DropdownMenu>
    </div>
  )
}
