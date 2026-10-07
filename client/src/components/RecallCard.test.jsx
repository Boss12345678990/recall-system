import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/render.jsx'
import RecallCard from './RecallCard.jsx'

const base = {
  id: 1, dueDate: '2026-10-09', step: 'CALLED_2', status: 'PENDING', onHold: false, version: 3,
  lineSentAt: '2026-09-24', call1At: '2026-09-26', call2At: '2026-09-28', call3At: null,
  patient: { id: 42, name: '王小明', phoneNumber: '0912345678', hasLine: true },
}

describe('RecallCard', () => {
  it('shows only the essentials: name, phone, next action and an overdue badge', () => {
    const item = { ...base, nextAction: { action: 'CALL_3', actionDate: '2026-09-30', overdueDays: 2 } }
    renderWithProviders(<RecallCard item={item} />)
    expect(screen.getByRole('heading', { name: '王小明' })).toBeInTheDocument()
    expect(screen.getByText('0912-345-678')).toBeInTheDocument()
    expect(screen.getByText('打第 3 次')).toBeInTheDocument()
    expect(screen.getByText('逾期 2 天')).toBeInTheDocument()
    expect(screen.queryByText(/回診日/)).not.toBeInTheDocument()
  })

  it('shows the due date instead when not overdue', () => {
    const item = { ...base, nextAction: { action: 'CALL_3', actionDate: '2026-10-02', overdueDays: 0 } }
    renderWithProviders(<RecallCard item={item} />)
    expect(screen.getByText('回診日 10/9')).toBeInTheDocument()
  })

  it('shows the status when there is no next action', () => {
    renderWithProviders(<RecallCard item={{ ...base, status: 'UNREACHABLE', nextAction: null }} />)
    expect(screen.getByText('聯絡不上')).toBeInTheDocument()
  })

  it('opens the patient when the card is clicked, but not when the footer is', () => {
    const item = { ...base, nextAction: null }
    renderWithProviders(<RecallCard item={item}><button type="button">footer</button></RecallCard>)
    fireEvent.click(screen.getByText('footer'))
    expect(screen.queryByText('客人詳細頁')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: '王小明' }))
    expect(screen.getByText('客人詳細頁')).toBeInTheDocument()
  })
})
