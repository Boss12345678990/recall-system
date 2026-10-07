import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'
import { invalidateRecallData } from './useRecalls.js'

export function usePreviewImport() {
  return useMutation({
    mutationFn: (file) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.upload('/imports/preview', formData)
    },
  })
}

export function useCommitImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (rows) => api.post('/imports/commit', { rows }),
    onSuccess: () => invalidateRecallData(queryClient),
  })
}
