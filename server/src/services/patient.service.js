import { prisma } from '../lib/prisma.js'
import { isValidDateString, todayInClinic, toDbDate } from '../lib/dates.js'
import { ConflictError, NotFoundError } from '../errors/AppError.js'
import { patientFromDb, patientFieldsToDb, visitFromDb } from '../mappers/patient.mapper.js'
import { recallFromDb, eventFromDb } from '../mappers/recall.mapper.js'
import { withNextAction } from '../domain/recallRules.js'
import { getSettings } from './setting.service.js'
import { recordVisitInTx } from './visit.service.js'

export const PAGE_SIZE = 50
const CURRENT_RECALL = { where: { status: { not: 'COMPLETED' } }, take: 1 }

export function toPatientWithRecall(row, settings, today) {
  const recallRow = row.recalls?.[0]
  return {
    ...patientFromDb(row),
    currentRecall: recallRow ? withNextAction(recallFromDb(recallRow), row.hasLine, settings, today) : null,
  }
}

function buildWhere(search, status) {
  const conditions = []
  if (search) {
    const or = [{ name: { contains: search } }]
    const digits = search.replace(/\D/g, '')
    if (digits.length >= 3) or.push({ phoneNumber: { contains: digits } })
    const date = search.replaceAll('/', '-')
    if (isValidDateString(date)) or.push({ birthDate: toDbDate(date) })
    conditions.push({ OR: or })
  }
  if (status) conditions.push({ recalls: { some: { status } } })
  return conditions.length ? { AND: conditions } : {}
}

export async function listPatients({ search, status, page }) {
  const today = todayInClinic()
  const where = buildWhere(search, status)
  const [rows, total, settings] = await Promise.all([
    prisma.patient.findMany({
      where,
      include: { recalls: CURRENT_RECALL },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.patient.count({ where }),
    getSettings(),
  ])
  return { items: rows.map((row) => toPatientWithRecall(row, settings, today)), page, pageSize: PAGE_SIZE, total }
}

export async function getPatient(id) {
  const today = todayInClinic()
  const row = await prisma.patient.findUnique({
    where: { id },
    include: { recalls: CURRENT_RECALL, visits: { orderBy: { visitDate: 'desc' } } },
  })
  if (!row) throw new NotFoundError('PATIENT_NOT_FOUND', '找不到這位病患')
  const [events, settings] = await Promise.all([
    prisma.recallEvent.findMany({ where: { recall: { patientId: id } }, orderBy: { id: 'desc' }, take: 100 }),
    getSettings(),
  ])
  return {
    ...toPatientWithRecall(row, settings, today),
    visits: row.visits.map(visitFromDb),
    events: events.map(eventFromDb),
  }
}

async function assertNoDuplicate(db, name, birthDate, excludeId) {
  const existing = await db.patient.findUnique({
    where: { name_birthDate: { name, birthDate: toDbDate(birthDate) } },
  })
  if (existing && existing.id !== excludeId) {
    throw new ConflictError('PATIENT_DUPLICATE', '已有相同姓名與生日的病患', { existingPatientId: existing.id })
  }
}

export async function createPatient({ registerVisitToday, ...input }) {
  const today = todayInClinic()
  const id = await prisma.$transaction(async (tx) => {
    await assertNoDuplicate(tx, input.name, input.birthDate)
    const row = await tx.patient.create({ data: patientFieldsToDb(input) })
    if (registerVisitToday) await recordVisitInTx(tx, row.id, { visitDate: today, note: null }, today)
    return row.id
  })
  return getPatient(id)
}

export async function updatePatient(id, changes) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.patient.findUnique({ where: { id } })
    if (!current) throw new NotFoundError('PATIENT_NOT_FOUND', '找不到這位病患')
    if (changes.name !== undefined || changes.birthDate !== undefined) {
      const name = changes.name ?? current.name
      const birthDate = changes.birthDate ?? current.birthDate.toISOString().slice(0, 10)
      await assertNoDuplicate(tx, name, birthDate, id)
    }
    await tx.patient.update({ where: { id }, data: patientFieldsToDb(changes) })
  })
  return getPatient(id)
}

export async function deletePatient(id) {
  const existing = await prisma.patient.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new NotFoundError('PATIENT_NOT_FOUND', '找不到這位病患')
  await prisma.patient.delete({ where: { id } })
}
