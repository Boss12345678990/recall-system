import { describe, it, expect } from 'vitest'
import {
  todayInClinic, addDays, addMonths, diffDays, toDbDate, fromDbDate, isValidDateString,
} from '../../src/lib/dates.js'

describe('todayInClinic', () => {
  it('uses the Taipei date while UTC is still on the previous day', () => {
    expect(todayInClinic(new Date('2026-10-05T17:00:00Z'))).toBe('2026-10-06')
  })
  it('stays on the Taipei date until Taipei midnight', () => {
    expect(todayInClinic(new Date('2026-10-06T15:59:59Z'))).toBe('2026-10-06')
  })
})

describe('date math', () => {
  it('adds days across a month boundary', () => expect(addDays('2026-09-28', 5)).toBe('2026-10-03'))
  it('subtracts days', () => expect(addDays('2026-10-03', -7)).toBe('2026-09-26'))
  it('clamps addMonths to the end of the month', () => {
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28')
    expect(addMonths('2027-08-31', 6)).toBe('2028-02-29')
  })
  it('diffDays is later minus earlier', () => {
    expect(diffDays('2026-10-06', '2026-10-04')).toBe(2)
    expect(diffDays('2026-10-04', '2026-10-06')).toBe(-2)
  })
})

describe('DB date conversion', () => {
  it('round trips a date string', () => expect(fromDbDate(toDbDate('1990-01-01'))).toBe('1990-01-01'))
  it('passes null through', () => {
    expect(toDbDate(null)).toBeNull()
    expect(fromDbDate(null)).toBeNull()
  })
})

describe('isValidDateString', () => {
  it.each(['2026-10-06', '2028-02-29'])('accepts %s', (s) => expect(isValidDateString(s)).toBe(true))
  it.each(['2026-02-30', '2026-13-01', '2026/10/06', '20261006', '', null, 20261006])(
    'rejects %s', (s) => expect(isValidDateString(s)).toBe(false),
  )
})

