import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { ToastProvider, useToast } from './Toast.jsx'

function Trigger({ options }) {
  const toast = useToast()
  return <button onClick={() => toast.show(options)}>show</button>
}

afterEach(() => vi.useRealTimers())

describe('Toast', () => {
  it('shows a message and hides it after the duration', () => {
    vi.useFakeTimers()
    render(<ToastProvider><Trigger options={{ message: '已記錄', duration: 1000 }} /></ToastProvider>)
    fireEvent.click(screen.getByText('show'))
    expect(screen.getByRole('status')).toHaveTextContent('已記錄')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('runs the action and closes', () => {
    const onUndo = vi.fn()
    render(<ToastProvider><Trigger options={{ message: '已記錄', action: { label: '復原', onClick: onUndo } }} /></ToastProvider>)
    fireEvent.click(screen.getByText('show'))
    fireEvent.click(screen.getByRole('button', { name: '復原' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
