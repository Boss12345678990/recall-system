import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../test/render.jsx'
import RecallRow from './RecallRow.jsx'

const TODAY = '2026-10-08'
const item = {
  id: 5, visitDate: '2026-04-11', dueDate: '2026-10-11', step: 'CALLED_1', status: 'PENDING', onHold: false, version: 2,
  lineSentAt: '2026-10-03', call1At: '2026-10-07', call2At: null, call3At: null, confirmedAt: null,
  nextAction: { action: 'CALL_2', actionDate: '2026-10-09', overdueDays: 0 },
  patient: { id: 42, name: '王小明', phoneNumber: '0912345678', hasLine: true, comment: '定期洗牙' },
}

function renderRow(props = {}) {
  renderWithProviders(
    <table><tbody><RecallRow item={item} today={TODAY} {...props}><td>actions</td></RecallRow></tbody></table>,
  )
}

afterEach(() => vi.useRealTimers())

describe('RecallRow', () => {
  it('shows the patient with phone and note, linking to their record', () => {
    renderRow()
    expect(screen.getByRole('link', { name: '王小明' })).toHaveAttribute('href', '/patients/42')
    expect(screen.getByText('0912-345-678')).toBeInTheDocument()
    expect(screen.getByText('定期洗牙')).toBeInTheDocument()
  })

  it('shows the last visit date, due date, countdown, stage and last contact', () => {
    renderRow()
    expect(screen.getByText('2026/04/11')).toBeInTheDocument()
    expect(screen.getByText('2026/10/11')).toBeInTheDocument()
    expect(screen.getByText('還有 3 天')).toBeInTheDocument()
    expect(screen.getByText('待撥電話')).toBeInTheDocument()
    expect(screen.getByText('昨天 · 未接')).toBeInTheDocument()
    expect(screen.getByText('actions')).toBeInTheDocument()
  })

  it('shows each contact step with its date when the progress cell is hovered', () => {
    renderRow()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(screen.getByText('待撥電話'))
    const panel = screen.getByRole('tooltip')
    expect(panel).toHaveTextContent('傳 LINE2026/10/03')
    expect(panel).toHaveTextContent('第 1 次電話2026/10/07')
    expect(panel).toHaveTextContent('第 2 次電話預計 2026/10/09')
    expect(panel).toHaveTextContent('第 3 次電話尚未進行')
    expect(panel).toHaveTextContent('下一步：打第 2 次（2026/10/09）')
  })

  it('keeps the panel open while the pointer moves onto it, and closes it after leaving', () => {
    vi.useFakeTimers()
    renderRow()
    const cell = screen.getByText('待撥電話')
    fireEvent.mouseEnter(cell)
    fireEvent.mouseLeave(cell)
    fireEvent.mouseEnter(screen.getByRole('tooltip'))
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByRole('tooltip'))
    act(() => vi.advanceTimersByTime(500))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('labels a waiting row with when the next call is', () => {
    renderRow({ item: { ...item, waiting: true, haveAction: false } })
    expect(screen.getByText('等待回覆・明天打第 2 通')).toBeInTheDocument()
    expect(screen.queryByText('待撥電話')).not.toBeInTheDocument()
  })

  it('opens the patient when the row is clicked', () => {
    renderRow()
    fireEvent.click(screen.getByText('2026/04/11'))
    expect(screen.getByText('病患詳細頁')).toBeInTheDocument()
  })

  it('compact rows keep only the patient and the two dates, marking a past-due date', () => {
    renderRow({ compact: true, today: '2026-10-12' })
    expect(screen.getByText('2026/04/11')).toBeInTheDocument()
    expect(screen.getByText('2026/10/11')).toBeInTheDocument()
    expect(screen.getByText('逾期')).toBeInTheDocument()
    expect(screen.queryByText('待撥電話')).not.toBeInTheDocument()
    expect(screen.queryByText(/還有|逾期 \d/)).not.toBeInTheDocument()
  })
})
