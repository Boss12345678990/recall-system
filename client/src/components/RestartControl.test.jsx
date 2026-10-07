import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RestartControl from './RestartControl.jsx'

describe('RestartControl', () => {
  it('asks for a due date, defaulting to the suggestion, then restarts', () => {
    const onRestart = vi.fn()
    render(<RestartControl defaultDate="2026-10-13" onRestart={onRestart} />)
    fireEvent.click(screen.getByRole('button', { name: '重新追蹤' }))
    expect(screen.getByLabelText('新的回診日')).toHaveValue('2026-10-13')
    fireEvent.change(screen.getByLabelText('新的回診日'), { target: { value: '2026-10-20' } })
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    expect(onRestart).toHaveBeenCalledWith('2026-10-20')
  })

  it('can be cancelled', () => {
    render(<RestartControl defaultDate="2026-10-13" onRestart={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '重新追蹤' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole('button', { name: '重新追蹤' })).toBeInTheDocument()
  })
})
