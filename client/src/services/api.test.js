import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError, setUnauthorizedHandler } from './api.js'

function respond(status, body) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new SyntaxError('no json')) : Promise.resolve(body)),
  })
}

describe('api', () => {
  let onUnauthorized
  beforeEach(() => {
    onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('unwraps data and sends JSON', async () => {
    const fetchMock = respond(200, { success: true, data: { id: 1 } })
    vi.stubGlobal('fetch', fetchMock)
    await expect(api.post('/patients', { name: '王' })).resolves.toEqual({ id: 1 })
    expect(fetchMock).toHaveBeenCalledWith('/api/patients', expect.objectContaining({
      method: 'POST', body: '{"name":"王"}', headers: { 'Content-Type': 'application/json' },
    }))
  })

  it('throws ApiError carrying the server message and details', async () => {
    vi.stubGlobal('fetch', respond(400, {
      success: false, error: { code: 'VALIDATION_ERROR', message: '電話格式錯誤', details: [{ field: 'phoneNumber', message: '電話格式錯誤' }] },
    }))
    const error = await api.get('/patients').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: '電話格式錯誤' })
    expect(error.details).toHaveLength(1)
  })

  it('treats a 200 with success:false as a failure', async () => {
    vi.stubGlobal('fetch', respond(200, { success: false, error: { code: 'X', message: '失敗' } }))
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'X' })
  })

  it('gives a zh-TW message when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: '無法連線到伺服器，請檢查網路' })
  })

  it('gives a zh-TW message when the response is not JSON', async () => {
    vi.stubGlobal('fetch', respond(502, undefined))
    await expect(api.get('/x')).rejects.toMatchObject({ status: 502, message: '系統發生錯誤，請稍後再試' })
  })

  it('calls the unauthorized handler on 401, except for login', async () => {
    vi.stubGlobal('fetch', respond(401, { success: false, error: { code: 'UNAUTHORIZED', message: '請先登入' } }))
    await api.get('/recalls/today').catch(() => {})
    expect(onUnauthorized).toHaveBeenCalledOnce()
    await api.post('/auth/login', {}).catch(() => {})
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
