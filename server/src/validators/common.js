import { z } from 'zod'
import { isValidDateString, todayInClinic } from '../lib/dates.js'
import { PHONE_PATTERN, NAME_MAX_LENGTH, COMMENT_MAX_LENGTH, normalizePhoneText } from '../domain/patientRules.js'

// Default zh-TW messages; schemas pass their own message where a generic one would be unclear.
z.setErrorMap((issue) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? '此欄位為必填' : '格式錯誤' }
    case z.ZodIssueCode.invalid_enum_value:
      return { message: '不是允許的選項' }
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: issue.minimum === 1 ? '此欄位為必填' : `至少 ${issue.minimum} 個字` }
      return { message: `不可小於 ${issue.minimum}` }
    case z.ZodIssueCode.too_big:
      return { message: issue.type === 'string' ? `最多 ${issue.maximum} 個字` : `不可大於 ${issue.maximum}` }
    case z.ZodIssueCode.unrecognized_keys:
      return { message: '含有不允許的欄位' }
    default:
      return { message: '格式錯誤' }
  }
})

export function requestSchema({ params = z.any(), query = z.any(), body = z.any() } = {}) {
  return z.object({ params, query, body })
}

export const idParams = z.object({ id: z.coerce.number().int().positive() })

export const dateString = z.string().refine(isValidDateString, { message: '日期格式錯誤，應為 YYYY-MM-DD' })

export const pastOrTodayDate = z.string().superRefine((value, ctx) => {
  if (!isValidDateString(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '日期格式錯誤，應為 YYYY-MM-DD' })
  else if (value > todayInClinic()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '日期不可晚於今天' })
})

export const personName = z.string().trim()
  .min(1, { message: '請輸入姓名' })
  .max(NAME_MAX_LENGTH, { message: `姓名最多 ${NAME_MAX_LENGTH} 字` })

export const phoneNumber = z.string()
  .transform(normalizePhoneText)
  .pipe(z.string().regex(PHONE_PATTERN, { message: '電話格式錯誤，應為 0 開頭的 9–10 位數字' }))

export const commentText = z.string().trim()
  .max(COMMENT_MAX_LENGTH, { message: `備註最多 ${COMMENT_MAX_LENGTH} 字` })
  .nullable()
  .transform((text) => text || null)
