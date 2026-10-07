import { z } from 'zod'
import { requestSchema } from './common.js'

export const loginSchema = requestSchema({
  body: z.object({
    username: z.string().trim().min(1, { message: '請輸入帳號' }),
    password: z.string().min(1, { message: '請輸入密碼' }),
  }),
})

export const changePasswordSchema = requestSchema({
  body: z.object({
    currentPassword: z.string().min(1, { message: '請輸入目前密碼' }),
    newPassword: z.string()
      .min(8, { message: '新密碼至少 8 個字元' })
      .max(100, { message: '新密碼最多 100 個字元' }),
  }),
})
