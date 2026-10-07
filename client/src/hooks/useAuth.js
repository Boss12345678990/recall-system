import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get('/auth/me')
      } catch (error) {
        if (error.status === 401) return null
        throw error
      }
    },
    staleTime: Infinity,
    refetchInterval: false,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (credentials) => api.post('/auth/login', credentials),
    onSuccess: (data) => queryClient.setQueryData(['me'], data.user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(['me'], null)
    },
  })
}

export function useChangePassword() {
  return useMutation({ mutationFn: (body) => api.patch('/auth/password', body) })
}
