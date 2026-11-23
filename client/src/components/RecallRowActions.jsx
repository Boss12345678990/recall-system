import { useState } from 'react'
import Button from './Button.jsx'
import ConfirmRecallDialog from './ConfirmRecallDialog.jsx'
import DropdownMenu, { MenuItem } from './DropdownMenu.jsx'
import { allowedActions } from '../utils/recallActions.js'
import { completedLabel, primaryAction  } from '../utils/recallDisplay.js'

function RescheduleMenu({ label, dueDate, today, disabled, onReschedule }) {
  const [custom, setCustom] = useState('')
  return (
    <DropdownMenu label={label} disabled={disabled}>
      {(close) => (
        <>
          {/* {rescheduleOptions(dueDate, today).map((option) => (
            <MenuItem key={option.label} onClick={() => { close(); onReschedule(option.date) }}>
              {option.label}
            </MenuItem>
          ))} */}
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

// 改約 is only for confirmed patients. On the 聯絡不上 tab, held imports and unreachable
// patients get 重新追蹤 to start their reminders over toward a new date.
function rescheduleLabel(item) {
  if (item.onHold || item.status === 'UNREACHABLE') return '重新追蹤'
  if (item.status === 'CONFIRMED') return '改約'
  return null
}

export default function RecallRowActions({
  item, today, showPrimary = true, disabled = false, onAction, onReschedule,
}) {
  const [confirming, setConfirming] = useState(false)
  const hasLine = item.patient.hasLine
  // Acted on today: the row stays on the list as finished, with no contact left to record,
  // but a patient who replies the same day (still 未確認) can still be confirmed.
  const doneToday = item.completedToday
  // A waiting patient has no contact due yet; they can only be confirmed if they reply.
  const primary = showPrimary && !item.waiting && !doneToday ? primaryAction(item, hasLine) : null
  const canConfirm = allowedActions(item, hasLine).includes('CONFIRM')
  const restartLabel = doneToday ? null : rescheduleLabel(item)

  return (
    <div className="flex items-center justify-end gap-2">
      {doneToday && (
        <span className="whitespace-nowrap text-xs font-medium text-green-700">✓ 今日已完成・{completedLabel(doneToday)}</span>
      )}
      {primary && (
        <Button variant={primary.action === 'CALL_NO_ANSWER' ? 'softDanger' : 'secondary'} size="sm" disabled={disabled}
          onClick={() => onAction(primary.action)}>
          {primary.label}
        </Button>
      )}
      {canConfirm && (
        <Button variant="success" size="sm" disabled={disabled} onClick={() => setConfirming(true)}>
          確認複診
        </Button>
      )}
      {restartLabel && (
        <RescheduleMenu label={restartLabel} dueDate={item.dueDate} today={today} disabled={disabled} onReschedule={onReschedule} />
      )}
      {confirming && (
        <ConfirmRecallDialog
          item={item}
          today={today}
          onCancel={() => setConfirming(false)}
          onConfirm={(dueDate) => { setConfirming(false); onAction('CONFIRM', { dueDate }) }}
        />
      )}
    </div>
  )
}
