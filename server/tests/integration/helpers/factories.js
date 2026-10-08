import { prisma } from '../../../src/lib/prisma.js'
import { addMonths, todayInClinic, toDbDate } from '../../../src/lib/dates.js'
import { recallFieldsToDb } from '../../../src/mappers/recall.mapper.js'

let sequence = 0

export async function createPatient({ birthDate = '1990-01-01', ...overrides } = {}) {
  sequence += 1
  return prisma.patient.create({
    data: { name: `測試病患${sequence}`, phoneNumber: '0912345678', hasLine: true, ...overrides, birthDate: toDbDate(birthDate) },
  })
}

// Creates a visit and the recall it started. Recall fields use 'YYYY-MM-DD' strings.
export async function createVisitWithRecall(patientId, { visitDate = todayInClinic(), ...recall } = {}) {
  const visit = await prisma.visit.create({ data: { patientId, visitDate: toDbDate(visitDate) } })
  const row = await prisma.recall.create({
    data: { patientId, visitId: visit.id, ...recallFieldsToDb({ dueDate: addMonths(visitDate, 6), ...recall }) },
  })
  return { visit, recall: row }
}
