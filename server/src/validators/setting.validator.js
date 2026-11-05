import { z } from 'zod'
import { requestSchema } from './common.js'

function rangedInt(label, min, max) {
  const message = `${label}需介於 ${min}–${max}`
  return z.number({ invalid_type_error: `${label}必須是數字` })
    .int({ message: `${label}必須是整數` })
    .min(min, { message })
    .max(max, { message })
}

export const updateSettingsSchema = requestSchema({
  body: z.object({
    recallIntervalMonths: rangedInt('回診間隔月數', 1, 24).optional(),
    lineLeadDays: rangedInt('提前傳 LINE 天數', 1, 30).optional(),
    callAfterLineDays: rangedInt('傳 LINE 後打電話天數', 1, 14).optional(),
    callGapDays: rangedInt('電話間隔天數', 1, 14).optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, { message: '沒有要修改的設定' }),
})
