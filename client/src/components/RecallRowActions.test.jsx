import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/render.jsx'
import RecallRowActions from './RecallRowActions.jsx'

const TODAY = '2026-10-08'
const item = (overrides = {}) => ({
  id: 5, dueDate: '2026-10-15', step: 'CALLED_2', status: 'PENDING', onHold: false, version: 3,
  lineSentAt: '2026-10-01', call1At: '2026-10-04', call2At: '2026-10-06', call3At: null, confirmedAt: null,
  patient: { id: 42, name: '王小明', phoneNumber: '0912345678', hasLine: true, comment: null },
  ...overrides,
})

function setup(props = {}) {
  const handlers = { onAction: vi.fn(), onReschedule: vi.fn(), onMarkUnreachable: vi.fn() }
  renderWithProviders(<RecallRowActions item={item()} today={TODAY} {...handlers} {...props} />)
  return handlers
}

const buttonLabels = () => screen.getAllByRole('button').map((button) => button.textContent)

describe('RecallRowActions', () => {
  it('offers the next call, confirm, 改約 and more', () => {
    setup()
    expect(buttonLabels()).toEqual(['第 3 通未接', '✓ 確認', '改約 ▾', '···'])
  })

  it('reports the contact and confirm actions', () => {
    const { onAction } = setup()
    fireEvent.click(screen.getByRole('button', { name: '第 3 通未接' }))
    fireEvent.click(screen.getByRole('button', { name: '✓ 確認' }))
    expect(onAction.mock.calls).toEqual([['CALL_NO_ANSWER'], ['CONFIRM']])
  })

  it('reschedules from a preset or a custom date', () => {
    const { onReschedule } = setup()
    fireEvent.click(screen.getByRole('button', { name: '改約 ▾' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '延後 1 週' }))
    fireEvent.click(screen.getByRole('button', { name: '改約 ▾' }))
    fireEvent.change(screen.getByLabelText('自訂日期'), { target: { value: '2026-12-01' } })
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    expect(onReschedule.mock.calls).toEqual([['2026-10-22'], ['2026-12-01']])
  })

  it('marks the patient unreachable from the more menu', () => {
    const { onMarkUnreachable } = setup()
    fireEvent.click(screen.getByRole('button', { name: '···' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '標記為聯絡不上' }))
    expect(onMarkUnreachable).toHaveBeenCalledOnce()
  })

  it('opens the patient from the more menu', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '···' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '查看病患資料' }))
    expect(screen.getByText('病患詳細頁')).toBeInTheDocument()
  })

  it('offers 重新追蹤 instead of contact buttons for unreachable recalls', () => {
    setup({ item: item({ step: 'CALLED_3', status: 'UNREACHABLE' }) })
    expect(buttonLabels()).toEqual(['重新追蹤 ▾', '···'])
  })

  it('can hide the contact button (waiting tab)', () => {
    setup({ showPrimary: false })
    expect(buttonLabels()).toEqual(['✓ 確認', '改約 ▾', '···'])
  })
})
