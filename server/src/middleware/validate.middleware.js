import { ValidationError } from '../errors/AppError.js'

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({ params: req.params, query: req.query, body: req.body ?? {} })
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.slice(1).join('.'),
        message: issue.message,
      }))
      throw new ValidationError('VALIDATION_ERROR', details[0]?.message ?? '輸入資料有誤', details)
    }
    // Express 5 makes req.query read-only, so parsed input lives on req.valid.
    req.valid = result.data
    next()
  }
}
