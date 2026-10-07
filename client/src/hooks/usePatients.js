import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api.js'
import { useToast } from '../components/Toast.jsx'
import { invalidateRecallData } from './useRecalls.js'
import { formatDate } from '../utils/format.js'

function toQueryString(params) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== '')
  return new URLSearchParams(entries).toString()
}

export function usePatients(params, options = {}) {
  return useQuery({
    queryKey: ['patients', params],
    queryFn: () => api.get(`/patients?${toQueryString(params)}`),
    placeholderData: keepPreviousData,
    ...options,
  })
}

export function usePatient(id) {
  return useQuery({ queryKey: ['patient', id], queryFn: () => api.get(`/patients/${id}`) })
}

function usePatientMutation(mutationFn, successMessage, { toastErrors = true } = {}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      const message = typeof successMessage === 'function' ? successMessage(data, variables) : successMessage
      if (message) toast.show({ message })
    },
    onError: (error) => toastErrors && toast.show({ message: error.message, tone: 'error' }),
    onSettled: () => invalidateRecallData(queryClient),
  })
}

// Form errors are shown inside the form, so create/update do not also toast them.
export function useCreatePatient() {
  return usePatientMutation(
    (body) => api.post('/patients', body),
    (data, body) => (body.registerVisitToday ? '已新增客人並登記今日看診' : '已新增客人'),
    { toastErrors: false },
  )
}

export function useUpdatePatient() {
  return usePatientMutation(({ id, ...body }) => api.patch(`/patients/${id}`, body), '已儲存', { toastErrors: false })
}

export function useDeletePatient() {
  return usePatientMutation((id) => api.del(`/patients/${id}`), '已刪除客人')
}

export function useRecordVisit() {
  return usePatientMutation(
    ({ patientId, visitDate }) => api.post(`/patients/${patientId}/visits`, visitDate ? { visitDate } : {}),
    (data) => `已登記看診，下次回診日 ${formatDate(data.recall.dueDate)}`,
  )
}

export function useDeleteVisit() {
  return usePatientMutation((visitId) => api.del(`/visits/${visitId}`), '已刪除看診紀錄')
}
