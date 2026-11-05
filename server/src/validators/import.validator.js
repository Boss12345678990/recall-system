import { z } from 'zod'
import { requestSchema, personName, phoneNumber, pastOrTodayDate, commentText } from './common.js'
import { MAX_IMPORT_ROWS } from '../domain/importRows.js'

const importRow = z.object({
  name: personName,
  birthDate: pastOrTodayDate,
  phoneNumber,
  lastVisitDate: pastOrTodayDate,
  hasLine: z.boolean(),
  comment: commentText,
}).strict()

export const commitSchema = requestSchema({
  body: z.object({
    rows: z.array(importRow)
      .min(1, { message: '沒有可匯入的資料' })
      .max(MAX_IMPORT_ROWS, { message: `一次最多匯入 ${MAX_IMPORT_ROWS} 筆` }),
  }).strict(),
})
