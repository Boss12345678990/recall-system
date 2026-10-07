import { prisma } from '../lib/prisma.js'

const SELECT = { recallIntervalMonths: true, lineLeadDays: true, callAfterLineDays: true, callGapDays: true }

// The clinic has a single settings row (id 1); it is created with defaults on first read.
export function getSettings(db = prisma) {
  return db.clinicSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 }, select: SELECT })
}

export async function updateSettings(changes) {
  await getSettings()
  return prisma.clinicSetting.update({ where: { id: 1 }, data: changes, select: SELECT })
}
