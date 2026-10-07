import { describe, it, expect } from 'vitest'
import { toErrorResponse } from '../../src/middleware/error.middleware.js'
import { ConflictError, NotFoundError } from '../../src/errors/AppError.js'

describe('toErrorResponse', () => {
  it('passes AppError through', () => {
    expect(toErrorResponse(new ConflictError('X', '衝突', { a: 1 })))
      .toEqual({ status: 409, code: 'X', message: '衝突', details: { a: 1 } })
    expect(toErrorResponse(new NotFoundError('NF', '找不到'))).toMatchObject({ status: 404, code: 'NF' })
  })
  it('maps malformed JSON to 400', () => {
    expect(toErrorResponse({ type: 'entity.parse.failed' })).toMatchObject({ status: 400, code: 'INVALID_JSON' })
  })
  it('maps Prisma unique violation to 409', () => {
    expect(toErrorResponse({ code: 'P2002' })).toMatchObject({ status: 409, code: 'DUPLICATE' })
  })
  it('maps Prisma record-not-found to 404', () => {
    expect(toErrorResponse({ code: 'P2025' })).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
  it('maps database connection failures to 503', () => {
    expect(toErrorResponse({ code: 'P1001' })).toMatchObject({ status: 503, code: 'DB_UNAVAILABLE' })
    expect(toErrorResponse({ name: 'PrismaClientInitializationError' })).toMatchObject({ status: 503 })
  })
  it('maps anything else to a zh-TW 500', () => {
    expect(toErrorResponse(new Error('boom')))
      .toEqual({ status: 500, code: 'INTERNAL_ERROR', message: '系統發生錯誤，請稍後再試' })
  })
})
