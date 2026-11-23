import { prisma } from '../lib/prisma.js'
import { fromDbDate, toDbDate, todayInClinic } from '../lib/dates.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js'
import { recallFromDb, recallFieldsToDb } from '../mappers/recall.mapper.js'
import {
  applyAction, applyManualEdit, buildTodayItems, canRestart, restartFields, snapshot, withNextAction,
} from '../domain/recallRules.js'
import { getSettings } from './setting.service.js'

// Tab lists. Confirmed recalls whose due date has passed sort first (due date ascending).
const LIST_QUERIES = {
  waiting: { where: { status: 'PENDING', onHold: false, step: { not: 'NOT_CONTACTED' } }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] },
  confirmed: { where: { status: 'CONFIRMED' }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] },
  unreachable: { where: { status: 'UNREACHABLE' }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] },
  // The 聯絡不上 tab: every unreachable patient, plus imports held because they were past due.
  'import-overdue': {
    where: { OR: [{ onHold: true, status: 'PENDING' }, { status: 'UNREACHABLE' }] },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  },
}

// "Waiting for a reply" also needs the next step to be not yet due, which only the recall rules know.
const LIST_FILTERS = {
  waiting: (item, today) => item.nextAction !== null && item.nextAction.actionDate > today,
}

const RECALL_INCLUDE = { patient: true, visit: { select: { visitDate: true } } }

// `visitDate` is the visit this recall cycle was created from (the patient's last visit).
function toRecallWithPatient(row) {
  const { id, name, phoneNumber, hasLine, comment } = row.patient
  return {
    ...recallFromDb(row),
    visitDate: row.visit ? fromDbDate(row.visit.visitDate) : null,
    patient: { id, name, phoneNumber, hasLine, comment },
  }
}

function staleError() {
  return new ConflictError('RECALL_STALE', '這筆資料剛被其他人更新，已重新整理')
}

async function loadList(list, settings, today) {
  const rows = await prisma.recall.findMany({ ...LIST_QUERIES[list], include: RECALL_INCLUDE })
  const items = rows.map((row) => withNextAction(toRecallWithPatient(row), row.patient.hasLine, settings, today))
  const keep = LIST_FILTERS[list]
  return keep ? items.filter((item) => keep(item, today)) : items
}

async function countLists(settings, today) {
  const lists = Object.keys(LIST_QUERIES)
  const lengths = await Promise.all(lists.map(async (list) => (await loadList(list, settings, today)).length))
  return Object.fromEntries(lists.map((list, index) => [list, lengths[index]]))
}

// Pending recalls, plus any recall (confirmed or unreachable too) with a contact recorded today.
function todayListWhere(today) {
  const day = toDbDate(today)
  return {
    onHold: false,
    OR: [
      { status: 'PENDING' },
      ...['lineSentAt', 'call1At', 'call2At', 'call3At', 'confirmedAt'].map((field) => ({ [field]: day })),
    ],
  }
}

export async function getToday() {
  const today = todayInClinic()
  const settings = await getSettings()
  const [rows, counts] = await Promise.all([
    prisma.recall.findMany({ where: todayListWhere(today), include: RECALL_INCLUDE }),
    countLists(settings, today),
  ])
  const items = buildTodayItems(rows.map(toRecallWithPatient), settings, today)
  const todo = items.filter((item) => item.haveAction)
  const overdue = todo.filter((item) => item.nextAction.overdueDays > 0).length
  // Waiting rows are shown but are not today's work, so 今日進度 = done / (done + to do).
  const done = items.filter((item) => item.completedToday).length
  return {
    today,
    summary: { total: todo.length, overdue },
    progress: { done, total: done + todo.length },
    counts,
    items,
  }
}

export async function getList(list) {
  const today = todayInClinic()
  const settings = await getSettings()
  return { items: await loadList(list, settings, today) }
}

async function loadForUpdate(tx, id, version) {
  const row = await tx.recall.findUnique({ where: { id }, include: RECALL_INCLUDE })
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
  const row = await tx.recall.findUnique({ where: { id }, include: RECALL_INCLUDE })
  const settings = await getSettings(tx)
  return { recall: withNextAction(toRecallWithPatient(row), row.patient.hasLine, settings, today), eventId }
}

export async function recordAction(id, { action, dueDate, version }) {
  const today = todayInClinic()
  if (dueDate && dueDate < today) throw new ValidationError('DUE_DATE_IN_PAST', '回診日不可早於今天')
  return prisma.$transaction(async (tx) => {
    const row = await loadForUpdate(tx, id, version)
    const patch = applyAction(recallFromDb(row), row.patient.hasLine, action, today, { dueDate })
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
    const note = `改約至 ${dueDate.replaceAll('-', '/')}`
    const eventId = await writeChange(tx, row, restartFields(dueDate), { type: 'RESTART', note })
    return result(tx, id, eventId, today)
  })
}
