import { describe, it, expect } from 'vitest'
import { formatPhone, formatMonthDay, formatDate } from './format.js'

describe('format', () => {
  it('formats mobile numbers 4-3-3 and leaves others alone', () => {
    expect(formatPhone('0912345678')).toBe('0912-345-678')
    expect(formatPhone('0223456789')).toBe('0223456789')
  })
  it('formats month/day without leading zeros', () => {
    expect(formatMonthDay('2026-09-06')).toBe('9/6')
    expect(formatMonthDay(null)).toBe('')
  })
  it('formats full dates with slashes', () => {
    expect(formatDate('2026-10-06')).toBe('2026/10/06')
  })
})
