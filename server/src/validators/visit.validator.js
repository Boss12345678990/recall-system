import { z } from 'zod'
import { requestSchema, idParams, dateString } from './common.js'

export const recordVisitSchema = requestSchema({
  params: idParams,
  body: z.object({
    visitDate: dateString.optional(),
    note: z.string().trim().max(500, { message: '備註最多 500 字' }).transform((text) => text || null).optional(),
  }).strict(),
})

export const visitIdSchema = requestSchema({ params: idParams })
