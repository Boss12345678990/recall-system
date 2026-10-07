import { Navigate } from 'react-router'
import { useMe } from '../hooks/useAuth.js'
import PageMessage from './PageMessage.jsx'

export default function RequireAuth({ children }) {
  const { data: user, isPending, isError } = useMe()
  if (isPending) return <PageMessage>載入中…</PageMessage>
  if (isError) return <PageMessage tone="error">無法連線到伺服器，請稍後再試</PageMessage>
  if (!user) return <Navigate to="/login" replace />
  return children
}
