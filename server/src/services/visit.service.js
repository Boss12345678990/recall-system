import { prisma } from '../lib/prisma.js'
import { addMonths, fromDbDate, todayInClinic, toDbDate } from '../lib/dates.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js'
import { visitFromDb } from '../mappers/patient.mapper.js'
import { recallFromDb, recallFieldsToDb } from '../mappers/recall.mapper.js'
import { snapshot } from '../domain/recallRules.js'
import { getSettings } from './setting.service.js'

// Serialises concurrent visit changes for one patient.
async function lockPatient(tx, patientId) {
  const rows = await tx.$queryRaw`SELECT id FROM Patient WHERE id = ${patientId} FOR UPDATE`
  if (rows.length === 0) throw new NotFoundError('PATIENT_NOT_FOUND', '找不到這位病患')
}

export async function recordVisitInTx(tx, patientId, { visitDate, note }, today) {
  if (visitDate > today) throw new ValidationError('VISIT_DATE_IN_FUTURE', '看診日不可晚於今天')
  const latest = await tx.visit.findFirst({ where: { patientId }, orderBy: { visitDate: 'desc' } })
  if (latest) {
    const latestDate = fromDbDate(latest.visitDate)
    if (visitDate === latestDate) throw new ConflictError('VISIT_DATE_TAKEN', '該日期已登記過看診')
    if (visitDate < latestDate) {
      throw new ValidationError('VISIT_BEFORE_LATEST', `看診日不可早於上次看診日 ${latestDate}`)
    }
  }

  const visit = await tx.visit.create({ data: { patientId, visitDate: toDbDate(visitDate), note } })

  const current = await tx.recall.findFirst({ where: { patientId, status: { not: 'COMPLETED' } } })
  if (current) {
    const before = snapshot(recallFromDb(current))
    await tx.recall.update({ where: { id: current.id }, data: { status: 'COMPLETED', version: { increment: 1 } } })
    await tx.recallEvent.create({
      data: { recallId: current.id, type: 'VISIT_RECORDED', before, after: { ...before, status: 'COMPLETED' } },
    })
  }

  const settings = await getSettings(tx)
  const recall = await tx.recall.create({
    data: { patientId, visitId: visit.id, dueDate: toDbDate(addMonths(visitDate, settings.recallIntervalMonths)) },
  })
  return { visit: visitFromDb(visit), recall: recallFromDb(recall) }
}

export async function recordVisit(patientId, { visitDate, note }) {
  const today = todayInClinic()
  return prisma.$transaction(async (tx) => {
    await lockPatient(tx, patientId)
    return recordVisitInTx(tx, patientId, { visitDate: visitDate ?? today, note: note ?? null }, today)
  })
}

export async function deleteVisit(visitId) {
  return prisma.$transaction(async (tx) => {
    const visit = await tx.visit.findUnique({ where: { id: visitId } })
    if (!visit) throw new NotFoundError('VISIT_NOT_FOUND', '找不到這筆看診紀錄')
    await lockPatient(tx, visit.patientId)

    const latest = await tx.visit.findFirst({ where: { patientId: visit.patientId }, orderBy: { visitDate: 'desc' } })
    if (latest.id !== visit.id) throw new ConflictError('VISIT_NOT_LATEST', '只能刪除最新一筆看診紀錄')

    // Cascades to the recall this visit started and that recall's events.
    await tx.visit.delete({ where: { id: visit.id } })

    const previous = await tx.visit.findFirst({
      where: { patientId: visit.patientId },
      orderBy: { visitDate: 'desc' },
      include: { recall: true },
    })
    const previousRecall = previous?.recall
    if (previousRecall?.status === 'COMPLETED') {
      const closedBy = await tx.recallEvent.findFirst({
        where: { recallId: previousRecall.id, type: 'VISIT_RECORDED' },
        orderBy: { id: 'desc' },
      })
      if (closedBy) {
        const before = snapshot(recallFromDb(previousRecall))
        await tx.recall.update({
          where: { id: previousRecall.id },
          data: { ...recallFieldsToDb(closedBy.before), version: { increment: 1 } },
        })
        await tx.recallEvent.create({
          data: { recallId: previousRecall.id, type: 'UNDO', note: '撤銷看診', before, after: closedBy.before },
        })
      }
    }
    return { patientId: visit.patientId }
  })
}
