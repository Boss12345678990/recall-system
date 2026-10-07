import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorRows, ValidRows } from './ImportPreviewRows.jsx'

describe('ErrorRows', () => {
  it('prefixes the column only when the message does not already name it', () => {
    const rows = [{
      rowNumber: 4,
      raw: { name: '王小明' },
      errors: [
        { column: '電話', message: '電話格式錯誤，應為 0 開頭的 9–10 位數字' },
        { column: '生日', message: '日期格式錯誤（例：1990-01-31 或 79/1/31）' },
      ],
    }]
    render(<ErrorRows rows={rows} />)
    expect(screen.getByText(
      '第 4 列（王小明）：電話格式錯誤，應為 0 開頭的 9–10 位數字、生日：日期格式錯誤（例：1990-01-31 或 79/1/31）',
    )).toBeInTheDocument()
  })
})

describe('ValidRows', () => {
  it('shows how each date was read so staff can catch misread dates before importing', () => {
    const rows = [{
      rowNumber: 2,
      raw: { name: '王小明' },
      data: { name: '王小明', birthDate: '1990-01-31', lastVisitDate: '2026-04-01' },
      dueDate: '2026-10-01',
      onHold: true,
    }]
    render(<ValidRows rows={rows} />)
    expect(screen.getByText('查看可匯入的資料（1）— 請確認生日與看診日是否正確')).toBeInTheDocument()
    expect(screen.getByText('第 2 列 王小明 · 生日 1990/01/31 · 上次看診 2026/04/01 · 回診日 2026/10/01（已過期）')).toBeInTheDocument()
  })
})
