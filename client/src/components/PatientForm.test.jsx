import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/render.jsx'
import PatientForm from './PatientForm.jsx'

describe('PatientForm', () => {
  it('submits trimmed values and the register-visit choice', () => {
    const onSubmit = vi.fn()
    renderWithProviders(<PatientForm submitLabel="儲存" onSubmit={onSubmit} registerVisitOption />)
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '王小明' } })
    fireEvent.change(screen.getByLabelText('生日'), { target: { value: '1990-01-31' } })
    fireEvent.change(screen.getByLabelText('電話'), { target: { value: '0912-345-678' } })
    fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    expect(onSubmit).toHaveBeenCalledWith(
      { name: '王小明', birthDate: '1990-01-31', phoneNumber: '0912-345-678', hasLine: true, comment: null },
      { registerVisit: true },
    )
  })

  it('shows server field errors next to their fields', () => {
    const error = { code: 'VALIDATION_ERROR', message: '電話格式錯誤', details: [{ field: 'phoneNumber', message: '電話格式錯誤' }] }
    renderWithProviders(<PatientForm submitLabel="儲存" onSubmit={() => {}} error={error} />)
    expect(screen.getByText('電話格式錯誤')).toBeInTheDocument()
  })

  it('links to the existing patient on a duplicate', () => {
    const error = { code: 'PATIENT_DUPLICATE', message: '已有相同姓名與生日的病患', details: { existingPatientId: 7 } }
    renderWithProviders(<PatientForm submitLabel="儲存" onSubmit={() => {}} error={error} />)
    expect(screen.getByText('已有相同姓名與生日的病患')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看這位病患' })).toHaveAttribute('href', '/patients/7')
  })
})
