export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = code
    this.details = details
  }
}

export class ValidationError extends AppError {
  constructor(code, message, details) { super(400, code, message, details) }
}

export class UnauthorizedError extends AppError {
  constructor(code, message) { super(401, code, message) }
}

export class NotFoundError extends AppError {
  constructor(code, message) { super(404, code, message) }
}

export class ConflictError extends AppError {
  constructor(code, message, details) { super(409, code, message, details) }
}

export class TooManyRequestsError extends AppError {
  constructor(code, message) { super(429, code, message) }
}

export class ServiceUnavailableError extends AppError {
  constructor(code, message) { super(503, code, message) }
}
