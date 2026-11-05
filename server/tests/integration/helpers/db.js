import { prisma } from '../../../src/lib/prisma.js'

export async function resetDb() {
  await prisma.recallEvent.deleteMany()
  await prisma.recall.deleteMany()
  await prisma.visit.deleteMany()
  await prisma.patient.deleteMany()
  await prisma.user.deleteMany()
  await prisma.clinicSetting.deleteMany()
}
