import { fromDbDate, toDbDate } from '../lib/dates.js'

export function patientFromDb(row) {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phoneNumber,
    birthDate: fromDbDate(row.birthDate),
    hasLine: row.hasLine,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function patientFieldsToDb(fields) {
  return 'birthDate' in fields ? { ...fields, birthDate: toDbDate(fields.birthDate) } : { ...fields }
}

export function visitFromDb(row) {
  return {
    id: row.id,
    patientId: row.patientId,
    visitDate: fromDbDate(row.visitDate),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }
}
