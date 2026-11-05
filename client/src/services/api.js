export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

let onUnauthorized = () => {}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

async function request(method, path, body, { isForm = false } = {}) {
  const options = { method, credentials: 'same-origin' }
  if (body !== undefined) {
    options.body = isForm ? body : JSON.stringify(body)
    if (!isForm) options.headers = { 'Content-Type': 'application/json' }
  }

  let response
  try {
    response = await fetch(`/api${path}`, options)
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '無法連線到伺服器，請檢查網路')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    const error = payload?.error ?? { code: 'UNKNOWN_ERROR', message: '系統發生錯誤，請稍後再試' }
    if (response.status === 401 && path !== '/auth/login') onUnauthorized()
    throw new ApiError(response.status, error.code, error.message, error.details)
  }
  return payload.data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
  upload: (path, formData) => request('POST', path, formData, { isForm: true }),
}
