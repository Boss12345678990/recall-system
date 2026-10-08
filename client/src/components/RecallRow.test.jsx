import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/render.jsx'
import RecallRow from './RecallRow.jsx'

const TODAY = '2026-10-08'
const item = {
  id: 5, dueDate: '2026-10-11', step: 'CALLED_1', status: 'PENDING', onHold: false, version: 2,
  lineSentAt: '2026-10-03', call1At: '2026-10-07', call2At: null, call3At: null, confirmedAt: null,
  nextAction: { action: 'CALL_2', actionDate: '2026-10-09', overdueDays: 0 },
  patient: { id: 42, name: '王小明', phoneNumber: '0912345678', hasLine: true, comment: '定期洗牙' },
}

function renderRow() {
  renderWithProviders(
    <table><tbody><RecallRow item={item} today={TODAY}><td>actions</td></RecallRow></tbody></table>,
  )
}

describe('RecallRow', () => {
  it('shows the patient with phone and note, linking to their record', () => {
    renderRow()
    expect(screen.getByRole('link', { name: '王小明' })).toHaveAttribute('href', '/patients/42')
    expect(screen.getByText('0912-345-678')).toBeInTheDocument()
    expect(screen.getByText('定期洗牙')).toBeInTheDocument()
  })

  it('shows the due date, countdown, stage and last contact', () => {
    renderRow()
    expect(screen.getByText('2026/10/11')).toBeInTheDocument()
    expect(screen.getByText('還有 3 天')).toBeInTheDocument()
    expect(screen.getByText('待撥電話')).toBeInTheDocument()
    expect(screen.getByText('昨天 · 未接')).toBeInTheDocument()
    expect(screen.getByText('actions')).toBeInTheDocument()
  })
})
