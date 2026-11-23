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
  const handlers = { onAction: vi.fn(), onReschedule: vi.fn() }
  renderWithProviders(<RecallRowActions item={item()} today={TODAY} {...handlers} {...props} />)
  return handlers
}

const buttonLabels = () => screen.getAllByRole('button').map((button) => button.textContent)

describe('RecallRowActions', () => {
  it('offers only the next call and confirm while the patient is being contacted', () => {
    setup()
    expect(buttonLabels()).toEqual(['第 3 通未接', '✓ 確認回診'])
  })

  it('shows unanswered-call buttons in soft red', () => {
    setup()
    expect(screen.getByRole('button', { name: '第 3 通未接' }).className).toContain('bg-red-50')
  })

  it('keeps 已傳 LINE in the plain style', () => {
    setup({ item: item({ step: 'NOT_CONTACTED', lineSentAt: null, call1At: null, call2At: null }) })
    expect(screen.getByRole('button', { name: '已傳 LINE' }).className).toContain('border-slate-300')
  })

  it('reports the contact action', () => {
    const { onAction } = setup()
    fireEvent.click(screen.getByRole('button', { name: '第 3 通未接' }))
    expect(onAction.mock.calls).toEqual([['CALL_NO_ANSWER']])
  })

  it('asks for the agreed appointment date before confirming, starting from the expected one', () => {
    const { onAction } = setup()
    fireEvent.click(screen.getByRole('button', { name: '✓ 確認回診' }))
    const dateInput = screen.getByLabelText(/確認的回診日/)
    expect(dateInput).toHaveValue('2026-10-15')
    fireEvent.change(dateInput, { target: { value: '2026-10-20' } })
    fireEvent.click(screen.getByRole('button', { name: '✓ 確認複診' }))
    expect(onAction.mock.calls).toEqual([['CONFIRM', { dueDate: '2026-10-20' }]])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not confirm when the date dialog is cancelled', () => {
    const { onAction } = setup()
    fireEvent.click(screen.getByRole('button', { name: '✓ 確認回診' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onAction).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers only 改約 for a confirmed patient', () => {
    setup({ item: item({ status: 'CONFIRMED', confirmedAt: '2026-10-06' }), showPrimary: false })
    expect(buttonLabels()).toEqual(['改約 ▾'])
  })

  it('reschedules a confirmed patient to the date staff pick', () => {
    const { onReschedule } = setup({ item: item({ status: 'CONFIRMED', confirmedAt: '2026-10-06' }) })
    fireEvent.click(screen.getByRole('button', { name: '改約 ▾' }))
    fireEvent.change(screen.getByLabelText('自訂日期'), { target: { value: '2026-12-01' } })
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    expect(onReschedule.mock.calls).toEqual([['2026-12-01']])
  })

  it('offers only 重新追蹤 for a 聯絡不上 patient', () => {
    setup({ item: item({ step: 'CALLED_3', status: 'UNREACHABLE', call3At: '2026-10-07' }), showPrimary: false })
    expect(buttonLabels()).toEqual(['重新追蹤 ▾'])
  })

  it('offers 重新追蹤 for imports held because they were past due', () => {
    setup({ item: item({ step: 'NOT_CONTACTED', onHold: true, lineSentAt: null, call1At: null, call2At: null }), showPrimary: false })
    expect(buttonLabels()).toEqual(['重新追蹤 ▾'])
  })

  it('offers only confirm for a patient waiting for their next step', () => {
    setup({ item: item({ waiting: true, haveAction: false }) })
    expect(buttonLabels()).toEqual(['✓ 確認回診'])
  })

  it('keeps confirm on a row contacted today, for a patient who replies the same day', () => {
    const { onAction } = setup({ item: item({ step: 'LINE_SENT', completedToday: 'LINE', haveAction: false }) })
    expect(screen.getByText('✓ 今日已完成・已傳 LINE')).toBeInTheDocument()
    expect(buttonLabels()).toEqual(['✓ 確認回診'])
    fireEvent.click(screen.getByRole('button', { name: '✓ 確認回診' }))
    fireEvent.click(screen.getByRole('button', { name: '✓ 確認複診' }))
    expect(onAction.mock.calls).toEqual([['CONFIRM', { dueDate: '2026-10-15' }]])
  })

  it.each([
    ['confirmed today', { status: 'CONFIRMED', confirmedAt: TODAY, completedToday: 'CONFIRMED' }, '✓ 今日已完成・確認複診'],
    ['unreachable after the third call', { step: 'CALLED_3', status: 'UNREACHABLE', call3At: TODAY, completedToday: 'CALL_3' }, '✓ 今日已完成・第 3 通未接'],
  ])('shows a row %s as finished, with no buttons', (_, overrides, label) => {
    setup({ item: item({ haveAction: false, ...overrides }) })
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toEqual([])
  })
})
