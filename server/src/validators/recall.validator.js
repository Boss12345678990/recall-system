import { z } from 'zod'
import { requestSchema, idParams, dateString } from './common.js'
import { STEPS } from '../domain/recallRules.js'

const version = z.number().int().min(0)

export const RECALL_LISTS = ['confirmed-no-show', 'import-overdue', 'unreachable']

export const listSchema = requestSchema({ query: z.object({ list: z.enum(RECALL_LISTS) }) })

export const actionSchema = requestSchema({
  params: idParams,
  body: z.object({ action: z.enum(['LINE_SENT', 'CALL_NO_ANSWER', 'CONFIRM']), version }).strict(),
})

export const undoSchema = requestSchema({
  params: idParams,
  body: z.object({ eventId: z.number().int().positive(), version }).strict(),
})

export const editSchema = requestSchema({
  params: idParams,
  body: z.object({
    step: z.enum(STEPS).optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'UNREACHABLE']).optional(),
    dueDate: dateString.optional(),
    note: z.string().trim().max(500, { message: '備註最多 500 字' }).transform((text) => text || null).optional(),
    version,
  }).strict().refine(
    (body) => body.step !== undefined || body.status !== undefined || body.dueDate !== undefined,
    { message: '沒有要修改的欄位' },
  ),
})

export const restartSchema = requestSchema({
  params: idParams,
  body: z.object({ dueDate: dateString, version }).strict(),
})
