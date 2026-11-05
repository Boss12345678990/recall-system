import { describe, it, expect } from 'vitest'
import { allowedActions } from './recallActions.js'

const recall = (overrides) => ({ step: 'NOT_CONTACTED', status: 'PENDING', onHold: false, ...overrides })

describe('allowedActions', () => {
  it.each([
    [recall(), true, ['LINE_SENT', 'CONFIRM']],
    [recall(), false, ['CALL_NO_ANSWER', 'CONFIRM']],
    [recall({ step: 'LINE_SENT' }), true, ['CALL_NO_ANSWER', 'CONFIRM']],
    [recall({ step: 'CALLED_2' }), true, ['CALL_NO_ANSWER', 'CONFIRM']],
    [recall({ step: 'CALLED_3' }), true, ['CONFIRM']],
    [recall({ status: 'CONFIRMED' }), true, []],
    [recall({ onHold: true }), true, []],
  ])('%o with LINE=%s → %o', (input, hasLine, expected) => {
    expect(allowedActions(input, hasLine)).toEqual(expected)
  })
})
