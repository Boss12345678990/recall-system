import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

export const CLINIC_TIMEZONE = 'Asia/Taipei'
const FORMAT = 'YYYY-MM-DD'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function todayInClinic(now = new Date()) {
  return dayjs(now).tz(CLINIC_TIMEZONE).format(FORMAT)
}

export function addDays(date, days) {
  return dayjs.utc(date).add(days, 'day').format(FORMAT)
}

// dayjs clamps to the last day of the month (Aug 31 + 6 months = Feb 28/29).
export function addMonths(date, months) {
  return dayjs.utc(date).add(months, 'month').format(FORMAT)
}

export function diffDays(later, earlier) {
  return dayjs.utc(later).diff(dayjs.utc(earlier), 'day')
}

export function isValidDateString(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value) && dayjs.utc(value).format(FORMAT) === value
}

// MySQL DATE columns map to JS Dates at UTC midnight.
export function toDbDate(date) {
  return date == null ? null : new Date(`${date}T00:00:00.000Z`)
}

export function fromDbDate(date) {
  return date == null ? null : date.toISOString().slice(0, 10)
}
