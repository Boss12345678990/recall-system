import { z } from 'zod'
import { requestSchema, idParams, dateString } from './common.js'
import { STEPS } from '../domain/recallRules.js'

const version = z.number().int().min(0)

export const RECALL_LISTS = ['waiting', 'confirmed', 'unreachable', 'import-overdue']

export const listSchema = requestSchema({ query: z.object({ list: z.enum(RECALL_LISTS) }) })

export const actionSchema = requestSchema({
  params: idParams,
  // Confirming asks staff for the appointment date the patient agreed to; other actions take no date.
  body: z.object({ action: z.enum(['LINE_SENT', 'CALL_NO_ANSWER', 'CONFIRM']), dueDate: dateString.optional(), version })
    .strict()
    .superRefine((body, ctx) => {
      if (body.action === 'CONFIRM' && body.dueDate === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: '請選擇回診日' })
      }
      if (body.action !== 'CONFIRM' && body.dueDate !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: '只有確認複診需要回診日' })
      }
    }),
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
