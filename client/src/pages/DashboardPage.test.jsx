import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../test/render.jsx'
import DashboardPage from './DashboardPage.jsx'

const TODAY = '2026-10-08'

function recall(id, name, overrides) {
  return {
    id, visitDate: '2026-04-10', dueDate: '2026-10-12', step: 'LINE_SENT', status: 'PENDING', onHold: false, version: 1,
    lineSentAt: '2026-10-05', call1At: null, call2At: null, call3At: null, confirmedAt: null,
    nextAction: { action: 'CALL_1', actionDate: TODAY, overdueDays: 0 },
    haveAction: false, completedToday: null, waiting: false,
    patient: { id, name, phoneNumber: '0912345678', hasLine: true, comment: null },
    ...overrides,
  }
}

const ITEMS = [
  recall(1, '王小明', { haveAction: true }),
  recall(2, '王大同', { haveAction: true }),
  recall(3, '陳美玲', { lineSentAt: TODAY, completedToday: 'LINE', nextAction: { action: 'CALL_1', actionDate: '2026-10-11', overdueDays: 0 } }),
  recall(4, '王麗華', { lineSentAt: '2026-10-07', waiting: true, nextAction: { action: 'CALL_1', actionDate: '2026-10-10', overdueDays: 0 } }),
]

vi.mock('../hooks/useRecalls.js', () => ({
  useToday: () => ({
    isPending: false,
    isError: false,
    data: {
      today: '2026-10-08',
      summary: { total: 2, overdue: 0 },
      progress: { done: 1, total: 3 },
      counts: { confirmed: 0, 'import-overdue': 0 },
      items: ITEMS,
    },
  }),
  useRecallList: () => ({ isPending: true }),
  useRecallAction: () => ({ isPending: false, mutate: vi.fn() }),
  useRestartRecall: () => ({ isPending: false, mutate: vi.fn() }),
}))

const names = () => screen.queryAllByRole('link').map((link) => link.textContent)
const subTab = (label) => screen.getByRole('tab', { name: new RegExp(`^${label}`) })

describe('DashboardPage 待辦', () => {
  it('splits today into 待處理, 今日已完成 and 等待回覆 sub-tabs with counts', () => {
    renderWithProviders(<DashboardPage />)
    expect(subTab('待處理')).toHaveTextContent('待處理2')
    expect(subTab('今日已完成')).toHaveTextContent('今日已完成1')
    expect(subTab('等待回覆')).toHaveTextContent('等待回覆1')
    expect(names()).toEqual(['王小明', '王大同'])

    fireEvent.click(subTab('今日已完成'))
    expect(names()).toEqual(['陳美玲'])
    fireEvent.click(subTab('等待回覆'))
    expect(names()).toEqual(['王麗華'])
    expect(screen.getByText('等待回覆・後天打第 1 通')).toBeInTheDocument()
  })

  it('filters by name and shows how many matches each sub-tab has', () => {
    renderWithProviders(<DashboardPage />)
    fireEvent.change(screen.getByPlaceholderText('搜尋病患姓名'), { target: { value: ' 小明 ' } })
    expect(names()).toEqual(['王小明'])
    expect(subTab('等待回覆')).toHaveTextContent('等待回覆0')

    fireEvent.change(screen.getByPlaceholderText('搜尋病患姓名'), { target: { value: '王' } })
    expect(subTab('等待回覆')).toHaveTextContent('等待回覆1')
    fireEvent.click(subTab('今日已完成'))
    expect(screen.getByText('找不到姓名含「王」的病患')).toBeInTheDocument()
  })
})
