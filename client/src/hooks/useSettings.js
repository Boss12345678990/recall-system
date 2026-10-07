import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api.js'

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') })
}
