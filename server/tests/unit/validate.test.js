import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { validate } from '../../src/middleware/validate.middleware.js'
import { requestSchema, idParams, dateString } from '../../src/validators/common.js'
import { ValidationError } from '../../src/errors/AppError.js'

const schema = requestSchema({ params: idParams, body: z.object({ visitDate: dateString }) })

describe('validate middleware', () => {
  it('stores parsed values on req.valid and calls next', () => {
    const req = { params: { id: '42' }, query: {}, body: { visitDate: '2026-10-06' } }
    const next = vi.fn()
    validate(schema)(req, {}, next)
    expect(req.valid.params.id).toBe(42)
    expect(next).toHaveBeenCalledOnce()
  })

  it('throws a ValidationError with zh-TW per-field details', () => {
    const req = { params: { id: 'abc' }, query: {}, body: {} }
    let error
    try { validate(schema)(req, {}, vi.fn()) } catch (e) { error = e }
    expect(error).toBeInstanceOf(ValidationError)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.details).toEqual(expect.arrayContaining([
      { field: 'id', message: '格式錯誤' },
      { field: 'visitDate', message: '此欄位為必填' },
    ]))
  })

  it('rejects impossible dates', () => {
    const req = { params: { id: '1' }, query: {}, body: { visitDate: '2026-02-30' } }
    expect(() => validate(schema)(req, {}, vi.fn())).toThrow('日期格式錯誤，應為 YYYY-MM-DD')
  })
})
