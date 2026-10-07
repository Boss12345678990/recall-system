import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProgressDots from './ProgressDots.jsx'

const recall = { lineSentAt: '2026-09-24', call1At: '2026-09-26', call2At: null, call3At: null }

describe('ProgressDots', () => {
  it('shows each step date on hover and marks done steps', () => {
    render(<ProgressDots recall={recall} hasLine />)
    expect(screen.getByTitle('傳 LINE 9/24')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTitle('第 1 次電話 9/26')).toHaveAttribute('data-done', 'true')
    expect(screen.getByTitle('第 2 次電話 尚未進行')).toHaveAttribute('data-done', 'false')
    expect(screen.getByTitle('第 3 次電話 尚未進行')).toBeInTheDocument()
  })

  it('marks the LINE step as skipped for patients without LINE', () => {
    render(<ProgressDots recall={{ ...recall, lineSentAt: null }} hasLine={false} />)
    expect(screen.getByTitle('未加 LINE')).toBeInTheDocument()
  })
})
