import { z } from 'zod'
import { requestSchema, idParams, personName, phoneNumber, pastOrTodayDate, commentText } from './common.js'

export const listPatientsSchema = requestSchema({
  query: z.object({
    search: z.string().trim().max(50).optional().transform((text) => text || undefined),
    status: z.enum(['PENDING', 'CONFIRMED', 'UNREACHABLE']).optional(),
    page: z.coerce.number().int().min(1).default(1),
  }),
})

export const patientIdSchema = requestSchema({ params: idParams })

export const createPatientSchema = requestSchema({
  body: z.object({
    name: personName,
    phoneNumber,
    birthDate: pastOrTodayDate,
    hasLine: z.boolean().default(true),
    comment: commentText.optional(),
  }).strict(),
})

export const updatePatientSchema = requestSchema({
  params: idParams,
  body: z.object({
    name: personName.optional(),
    phoneNumber: phoneNumber.optional(),
    birthDate: pastOrTodayDate.optional(),
    hasLine: z.boolean().optional(),
    comment: commentText.optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, { message: '沒有要修改的欄位' }),
})
