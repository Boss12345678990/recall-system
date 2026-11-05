import { fromDbDate, toDbDate } from '../lib/dates.js'

const DATE_FIELDS = ['dueDate', 'lineSentAt', 'call1At', 'call2At', 'call3At', 'confirmedAt']

export function recallFromDb(row) {
  const recall = {
    id: row.id,
    patientId: row.patientId,
    visitId: row.visitId,
    step: row.step,
    status: row.status,
    onHold: row.onHold,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
  for (const field of DATE_FIELDS) recall[field] = fromDbDate(row[field])
  return recall
}

// Converts any date-string fields present in `fields` to Prisma Date values.
export function recallFieldsToDb(fields) {
  const data = { ...fields }
  for (const field of DATE_FIELDS) {
    if (field in data) data[field] = toDbDate(data[field])
  }
  return data
}

export function eventFromDb(row) {
  return {
    id: row.id,
    recallId: row.recallId,
    type: row.type,
    action: row.action,
    note: row.note,
    before: row.before,
    after: row.after,
    createdAt: row.createdAt.toISOString(),
  }
}
