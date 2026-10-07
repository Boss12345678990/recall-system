import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActionButtons from './ActionButtons.jsx'

describe('ActionButtons', () => {
  it('offers LINE and confirm before any contact', () => {
    render(<ActionButtons recall={{ step: 'NOT_CONTACTED', status: 'PENDING', onHold: false }} hasLine onAction={() => {}} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['已傳 LINE', '確認複診'])
  })

  it('reports the chosen action', () => {
    const onAction = vi.fn()
    render(<ActionButtons recall={{ step: 'CALLED_1', status: 'PENDING', onHold: false }} hasLine onAction={onAction} />)
    fireEvent.click(screen.getByRole('button', { name: '沒接' }))
    expect(onAction).toHaveBeenCalledWith('CALL_NO_ANSWER')
  })

  it('disables every button while a request is in flight', () => {
    render(<ActionButtons recall={{ step: 'LINE_SENT', status: 'PENDING', onHold: false }} hasLine onAction={() => {}} disabled />)
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled())
  })
})
