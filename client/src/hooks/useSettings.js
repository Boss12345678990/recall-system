import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'
import { useToast } from '../components/Toast.jsx'
import { invalidateRecallData } from './useRecalls.js'

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (changes) => api.patch('/settings', changes),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data)
      toast.show({ message: '設定已儲存' })
      invalidateRecallData(queryClient)
    },
  })
}
