import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { setUnauthorizedHandler } from './services/api.js'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchInterval: 5 * 60 * 1000,
      retry: (failureCount, error) => error?.status >= 500 && failureCount < 2,
    },
  },
})

// Any 401 means the session expired: clearing `me` makes RequireAuth redirect to /login.
setUnauthorizedHandler(() => queryClient.setQueryData(['me'], null))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
