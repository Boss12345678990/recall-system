import { AppError } from '../errors/AppError.js'
import { logger } from '../lib/logger.js'

const DB_UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017'])

export function toErrorResponse(err) {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details }
  }
  if (err?.type === 'entity.parse.failed') return { status: 400, code: 'INVALID_JSON', message: '請求格式錯誤' }
  if (err?.type === 'entity.too.large') return { status: 400, code: 'PAYLOAD_TOO_LARGE', message: '資料量過大' }
  if (err?.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE'
      ? { status: 400, code: 'FILE_TOO_LARGE', message: '檔案不可超過 5 MB' }
      : { status: 400, code: 'UPLOAD_ERROR', message: '檔案上傳失敗' }
  }
  if (err?.code === 'P2002') return { status: 409, code: 'DUPLICATE', message: '資料重複，請重新整理後再試' }
  if (err?.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: '找不到資料' }
  if (err?.name === 'PrismaClientInitializationError' || DB_UNAVAILABLE_CODES.has(err?.code)) {
    return { status: 503, code: 'DB_UNAVAILABLE', message: '資料庫暫時無法連線，請稍後再試' }
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: '系統發生錯誤，請稍後再試' }
}

export function errorHandler(err, req, res, next) {
  const { status, code, message, details } = toErrorResponse(err)
  const log = req.log ?? logger
  if (status >= 500) log.error({ err }, 'request failed')
  else log.warn({ code, details }, 'request rejected')
  if (res.headersSent) return next(err)
  const error = details === undefined ? { code, message } : { code, message, details }
  res.status(status).json({ success: false, error })
}
