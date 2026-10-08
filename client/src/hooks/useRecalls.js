import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'
import { useToast } from '../components/Toast.jsx'

export function invalidateRecallData(queryClient) {
  return Promise.all(
    ['today', 'recallList', 'patients', 'patient'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  )
}

export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: () => api.get('/recalls/today') })
}

export function useRecallList(list, options = {}) {
  return useQuery({ queryKey: ['recallList', list], queryFn: () => api.get(`/recalls?list=${list}`), ...options })
}

function useRecallMutation(mutationFn, successMessage) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn,
    onSuccess: () => successMessage && toast.show({ message: successMessage }),
    onError: (error) => toast.show({ message: error.message, tone: 'error' }),
    onSettled: () => invalidateRecallData(queryClient),
  })
}

export function useRecallAction() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const undo = useRecallMutation(
    ({ id, eventId, version }) => api.post(`/recalls/${id}/undo`, { eventId, version }),
    '已復原',
  )
  return useMutation({
    mutationFn: ({ id, action, version }) => api.post(`/recalls/${id}/actions`, { action, version }),
    onSuccess: ({ recall, eventId }) =>
      toast.show({
        message: '已記錄',
        duration: 10_000,
        action: { label: '復原', onClick: () => undo.mutate({ id: recall.id, eventId, version: recall.version }) },
      }),
    onError: (error) => toast.show({ message: error.message, tone: 'error' }),
    onSettled: () => invalidateRecallData(queryClient),
  })
}

export function useEditRecall() {
  return useRecallMutation(({ id, ...body }) => api.patch(`/recalls/${id}`, body), '已儲存')
}

export function useRestartRecall() {
  return useRecallMutation(
    ({ id, dueDate, version }) => api.post(`/recalls/${id}/restart`, { dueDate, version }),
    '已改約，提醒會從傳 LINE 重新開始',
  )
}

export function useMarkUnreachable() {
  return useRecallMutation(
    ({ id, version }) => api.patch(`/recalls/${id}`, { status: 'UNREACHABLE', version }),
    '已標記為聯絡不上',
  )
}
