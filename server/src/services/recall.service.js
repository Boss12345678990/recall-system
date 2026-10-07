import { prisma } from '../lib/prisma.js'
import { todayInClinic, toDbDate } from '../lib/dates.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js'
import { recallFromDb, recallFieldsToDb } from '../mappers/recall.mapper.js'
import {
  applyAction, applyManualEdit, buildTodayItems, canRestart, restartFields, snapshot, withNextAction,
} from '../domain/recallRules.js'
import { getSettings } from './setting.service.js'

const LIST_QUERIES = {
  'confirmed-no-show': (today) => ({
    where: { status: 'CONFIRMED', dueDate: { lt: toDbDate(today) } },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  }),
  'import-overdue': () => ({
    where: { onHold: true, status: 'PENDING' },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  }),
  unreachable: () => ({
    where: { status: 'UNREACHABLE' },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  }),
}

function toRecallWithPatient(row) {
  const { id, name, phoneNumber, hasLine } = row.patient
  return { ...recallFromDb(row), patient: { id, name, phoneNumber, hasLine } }
}

function staleError() {
  return new ConflictError('RECALL_STALE', '這筆資料剛被其他人更新，已重新整理')
}

async function countLists(today) {
  const entries = await Promise.all(
    Object.entries(LIST_QUERIES).map(async ([list, query]) => [list, await prisma.recall.count({ where: query(today).where })]),
  )
  return Object.fromEntries(entries)
}

export async function getToday() {
  const today = todayInClinic()
  const [rows, settings, counts] = await Promise.all([
    prisma.recall.findMany({ where: { status: 'PENDING', onHold: false }, include: { patient: true } }),
    getSettings(),
    countLists(today),
  ])
  const items = buildTodayItems(rows.map(toRecallWithPatient), settings, today)
  const overdue = items.filter((item) => item.nextAction.overdueDays > 0).length
  return { today, summary: { total: items.length, overdue }, counts, items }
}

export async function getList(list) {
  const today = todayInClinic()
  const [rows, settings] = await Promise.all([
    prisma.recall.findMany({ ...LIST_QUERIES[list](today), include: { patient: true } }),
    getSettings(),
  ])
  return {
    items: rows.map((row) => withNextAction(toRecallWithPatient(row), row.patient.hasLine, settings, today)),
  }
}

async function loadForUpdate(tx, id, version) {
  const row = await tx.recall.findUnique({ where: { id }, include: { patient: true } })
  if (!row) throw new NotFoundError('RECALL_NOT_FOUND', '找不到這筆回診追蹤')
  if (row.version !== version) throw staleError()
  return row
}

// Optimistic concurrency: the update only applies if nobody changed the row since it was read.
async function writeChange(tx, row, fields, event) {
  const { count } = await tx.recall.updateMany({
    where: { id: row.id, version: row.version },
    data: { ...recallFieldsToDb(fields), version: { increment: 1 } },
  })
  if (count === 0) throw staleError()
  const before = snapshot(recallFromDb(row))
  const created = await tx.recallEvent.create({
    data: { recallId: row.id, ...event, before, after: { ...before, ...fields } },
  })
  return created.id
}

async function result(tx, id, eventId, today) {
  const row = await tx.recall.findUnique({ where: { id }, include: { patient: true } })
  const settings = await getSettings(tx)
  return { recall: withNextAction(toRecallWithPatient(row), row.patient.hasLine, settings, today), eventId }
}

export async function recordAction(id, { action, version }) {
  const today = todayInClinic()
  return prisma.$transaction(async (tx) => {
    const row = await loadForUpdate(tx, id, version)
    const patch = applyAction(recallFromDb(row), row.patient.hasLine, action, today)
    if (!patch) throw new ConflictError('ACTION_NOT_ALLOWED', '目前的步驟無法執行這個動作，請重新整理')
    const eventId = await writeChange(tx, row, patch, { type: 'ACTION', action })
    return result(tx, id, eventId, today)
  })
}

export async function undoAction(id, { eventId, version }) {
  const today = todayInClinic()
  return prisma.$transaction(async (tx) => {
    const row = await loadForUpdate(tx, id, version)
    const latest = await tx.recallEvent.findFirst({ where: { recallId: id }, orderBy: { id: 'desc' } })
    if (!latest || latest.id !== eventId || latest.type !== 'ACTION') {
      throw new ConflictError('UNDO_NOT_ALLOWED', '只能復原這筆追蹤的最後一個動作')
    }
    const undoEventId = await writeChange(tx, row, latest.before, { type: 'UNDO', note: '復原上一個動作' })
    return result(tx, id, undoEventId, today)
  })
}

export async function editRecall(id, { step, status, dueDate, note, version }) {
  const today = todayInClinic()
  return prisma.$transaction(async (tx) => {
    const row = await loadForUpdate(tx, id, version)
    const edit = applyManualEdit(recallFromDb(row), { step, status, dueDate }, today)
    if (edit.error === 'RECALL_COMPLETED') throw new ConflictError('RECALL_COMPLETED', '已回診的追蹤無法修改')
    if (edit.error === 'PENDING_AT_CALLED_3') {
      throw new ValidationError('PENDING_AT_CALLED_3', '已撥打 3 次的追蹤無法設為未確認，請同時將步驟改回較早的階段')
    }
    const eventId = await writeChange(tx, row, edit.patch, { type: 'MANUAL_EDIT', note: note ?? null })
    return result(tx, id, eventId, today)
  })
}

export async function restartRecall(id, { dueDate, version }) {
  const today = todayInClinic()
  if (dueDate < today) throw new ValidationError('DUE_DATE_IN_PAST', '回診日不可早於今天')
  return prisma.$transaction(async (tx) => {
    const row = await loadForUpdate(tx, id, version)
    if (!canRestart(recallFromDb(row), today)) {
      throw new ConflictError('RESTART_NOT_ALLOWED', '這筆追蹤目前不需要重新追蹤')
    }
    const eventId = await writeChange(tx, row, restartFields(dueDate), { type: 'RESTART' })
    return result(tx, id, eventId, today)
  })
}
