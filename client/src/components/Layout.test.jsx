import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from './Toast.jsx'
import Layout from './Layout.jsx'

const ok = (data) => ({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data }) })

afterEach(() => vi.unstubAllGlobals())

describe('Layout logout', () => {
  it('goes back to the login page after logging out', async () => {
    const fetchMock = vi.fn((url) => Promise.resolve(
      url.includes('/recalls/today') ? ok({ summary: { total: 0, overdue: 0 } }) : ok(null),
    ))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route path="/login" element={<p>登入頁</p>} />
              <Route element={<Layout />}>
                <Route index element={<p>首頁</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '登出' }))

    await waitFor(() => expect(screen.getByText('登入頁')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
  })
})
