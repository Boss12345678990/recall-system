// Fake patients for trying the app locally. Every demo patient's comment starts with DEMO_TAG,
// so re-seeding replaces only demo rows. Dates are relative to today, so the to-do list always
// shows a realistic mix. Recall states are built by replaying the real recall rules.
import { prisma } from '../lib/prisma.js'
import { addDays, addMonths, todayInClinic, toDbDate } from '../lib/dates.js'
import { applyAction, snapshot } from '../domain/recallRules.js'
import { recallFieldsToDb } from '../mappers/recall.mapper.js'
import { getSettings } from '../services/setting.service.js'

export const DEMO_TAG = '【測試資料】'

// dueIn / action offsets are days from today; actions replay in order.
const SCENARIOS = [
  { name: '林志明', birthDate: '1982-03-14', note: '今天要傳 LINE', dueIn: 7, actions: [] },
  { name: '陳淑芬', birthDate: '1975-11-02', note: '傳 LINE 已逾期 2 天', dueIn: 5, actions: [] },
  { name: '王秀英', birthDate: '1948-06-20', note: '沒有 LINE，今天直接打電話', hasLine: false, dueIn: 7, actions: [] },
  { name: '張家豪', birthDate: '1990-08-08', note: '今天打第 1 次', dueIn: 4, actions: [['LINE_SENT', -3]] },
  { name: '李美玲', birthDate: '1987-01-25', note: '第 1 次電話已逾期 1 天', dueIn: 3, actions: [['LINE_SENT', -4]] },
  { name: '黃建國', birthDate: '1965-09-30', note: '今天打第 2 次', dueIn: 2, actions: [['LINE_SENT', -5], ['CALL_NO_ANSWER', -2]] },
  {
    name: '吳雅婷', birthDate: '1995-04-17', note: '第 3 次電話已逾期 2 天', dueIn: -2,
    actions: [['LINE_SENT', -9], ['CALL_NO_ANSWER', -6], ['CALL_NO_ANSWER', -4]],
  },
  { name: '劉俊傑', birthDate: '1979-12-05', note: '一個月後回診', dueIn: 30, actions: [] },
  { name: '蔡宜君', birthDate: '2001-07-11', note: '三個月後回診', dueIn: 90, actions: [] },
  { name: '楊志偉', birthDate: '1970-02-28', note: '已確認複診', dueIn: 3, actions: [['LINE_SENT', -4], ['CONFIRM', -1]] },
  { name: '許雅芳', birthDate: '1988-10-10', note: '確認了但沒來', dueIn: -5, actions: [['LINE_SENT', -12], ['CONFIRM', -10]] },
  {
    name: '鄭文雄', birthDate: '1958-05-05', note: '打 3 次都沒接', dueIn: -3,
    actions: [['LINE_SENT', -12], ['CALL_NO_ANSWER', -9], ['CALL_NO_ANSWER', -7], ['CALL_NO_ANSWER', -5]],
  },
  { name: '謝佩珊', birthDate: '1992-03-03', note: '匯入時回診日已過 2 個月', dueIn: -60, onHold: true, actions: [] },
  { name: '郭明德', birthDate: '1960-08-15', note: '匯入時回診日已過半年以上', dueIn: -200, onHold: true, actions: [] },
  { name: '洪淑惠', birthDate: '1983-06-06', note: '有上一次的回診紀錄', dueIn: 45, actions: [], withPreviousCycle: true },
  { name: '曾小華', birthDate: '2010-09-09', note: '剛建檔，尚未登記看診', noVisit: true },
]

// Events get a 10:00 Taipei timestamp on the day they happened.
function atTenTaipei(date) {
  return new Date(`${date}T02:00:00.000Z`)
}

function initialRecall(dueDate, onHold) {
  return {
    dueDate, step: 'NOT_CONTACTED', status: 'PENDING', onHold,
    lineSentAt: null, call1At: null, call2At: null, call3At: null, confirmedAt: null,
  }
}

async function createCycle(tx, patient, { visitDate, dueDate, onHold = false, actions, hasLine }) {
  const visit = await tx.visit.create({ data: { patientId: patient.id, visitDate: toDbDate(visitDate) } })
  let state = initialRecall(dueDate, onHold)
  const events = []
  for (const [action, date] of actions) {
    const patch = applyAction(state, hasLine, action, date)
    if (!patch) throw new Error(`Demo scenario for ${patient.name}: ${action} not allowed at step ${state.step}`)
    const next = { ...state, ...patch }
    events.push({ type: 'ACTION', action, before: snapshot(state), after: snapshot(next), createdAt: atTenTaipei(date) })
    state = next
  }
  const recall = await tx.recall.create({
    data: { patientId: patient.id, visitId: visit.id, version: events.length, ...recallFieldsToDb(state) },
  })
  for (const event of events) await tx.recallEvent.create({ data: { recallId: recall.id, ...event } })
  return { recall, state }
}

export async function seedDemoData() {
  const today = todayInClinic()
  const day = (offset) => addDays(today, offset)
  const settings = await getSettings()

  return prisma.$transaction(async (tx) => {
    const { count: removed } = await tx.patient.deleteMany({ where: { comment: { startsWith: DEMO_TAG } } })

    for (const [index, s] of SCENARIOS.entries()) {
      const hasLine = s.hasLine ?? true
      const patient = await tx.patient.create({
        data: {
          name: s.name,
          phoneNumber: `0911000${String(index + 1).padStart(3, '0')}`,
          birthDate: toDbDate(s.birthDate),
          hasLine,
          comment: `${DEMO_TAG}${s.note}`,
        },
      })
      if (s.noVisit) continue

      const dueDate = day(s.dueIn)
      const visitDate = addMonths(dueDate, -settings.recallIntervalMonths)

      if (s.withPreviousCycle) {
        // An earlier cycle the patient completed by coming back on `visitDate`.
        const previousVisit = addMonths(visitDate, -settings.recallIntervalMonths)
        const { recall, state } = await createCycle(tx, patient, {
          visitDate: previousVisit, dueDate: visitDate, hasLine,
          actions: [['LINE_SENT', addDays(visitDate, -7)], ['CONFIRM', addDays(visitDate, -5)]],
        })
        const completed = { ...state, status: 'COMPLETED' }
        await tx.recall.update({ where: { id: recall.id }, data: { status: 'COMPLETED', version: { increment: 1 } } })
        await tx.recallEvent.create({
          data: {
            recallId: recall.id, type: 'VISIT_RECORDED',
            before: snapshot(state), after: snapshot(completed), createdAt: atTenTaipei(visitDate),
          },
        })
      }

      await createCycle(tx, patient, {
        visitDate, dueDate, hasLine, onHold: s.onHold ?? false,
        actions: s.actions.map(([action, offset]) => [action, day(offset)]),
      })
    }
    return { removed, created: SCENARIOS.length }
  }, { timeout: 60_000 })
}
