import dayjs from 'dayjs'

export function formatPhone(digits) {
  if (/^09\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  return digits
}

export function formatMonthDay(date) {
  if (!date) return ''
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function formatDate(date) {
  return date ? date.replaceAll('-', '/') : ''
}

export function formatDateTime(iso) {
  return dayjs(iso).format('YYYY/MM/DD HH:mm')
}

// The clinic computer runs in Taipei time, so the browser's local date is the clinic's date.
export function todayLocal() {
  return dayjs().format('YYYY-MM-DD')
}

export function addDaysLocal(date, days) {
  return dayjs(date).add(days, 'day').format('YYYY-MM-DD')
}
