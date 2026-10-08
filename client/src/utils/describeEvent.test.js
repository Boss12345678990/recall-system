import { describe, it, expect } from 'vitest'
import { describeEvent } from './describeEvent.js'

const before = { step: 'LINE_SENT', status: 'PENDING', dueDate: '2026-10-13' }

describe('describeEvent', () => {
  it('names one-click actions by the button the staff pressed', () => {
    const event = { type: 'ACTION', action: 'CALL_NO_ANSWER', note: null, before, after: { ...before, step: 'CALLED_1' } }
    expect(describeEvent(event)).toEqual({ title: '沒接', lines: ['步驟：已傳 LINE → 已撥打 1 次'] })
  })

  it('lists every changed field and the note for manual edits', () => {
    const event = {
      type: 'MANUAL_EDIT', action: null, note: '病患說下個月再約',
      before, after: { ...before, status: 'CONFIRMED', dueDate: '2026-11-02' },
    }
    expect(describeEvent(event)).toEqual({
      title: '手動修改',
      lines: ['狀態：未確認 → 確認複診', '回診日：2026/10/13 → 2026/11/02', '備註：病患說下個月再約'],
    })
  })
})
