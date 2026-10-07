import { describe, it, expect } from 'vitest'
import { parseDateValue, normalizeImportPhone, parseHasLine, validateImportRow } from '../../src/domain/importRows.js'

describe('parseDateValue', () => {
  it.each([
    [new Date(Date.UTC(1990, 0, 31)), '1990-01-31'],
    [32874, '1990-01-01'],
    ['1990-01-31', '1990-01-31'],
    ['1990/1/31', '1990-01-31'],
    ['79/1/31', '1990-01-31'],
    ['079/01/31', '1990-01-31'],
    ['民國79年1月31日', '1990-01-31'],
    ['115/10/06', '2026-10-06'],
  ])('parses %s', (input, expected) => expect(parseDateValue(input)).toBe(expected))

  it.each(['2026-02-30', 'abc', '', null, '1990-1'])('rejects %s', (input) => {
    expect(parseDateValue(input)).toBeNull()
  })
})

describe('normalizeImportPhone', () => {
  it('restores the leading zero Excel drops from numeric cells', () => {
    expect(normalizeImportPhone(912345678)).toBe('0912345678')
    expect(normalizeImportPhone(223456789)).toBe('0223456789')
  })
  it('strips separators from text', () => {
    expect(normalizeImportPhone('0912-345-678')).toBe('0912345678')
    expect(normalizeImportPhone('(02) 2345-6789')).toBe('0223456789')
  })
})

describe('parseHasLine', () => {
  it.each([[null, true], ['', true], ['是', true], ['Y', true], [true, true], ['否', false], ['無', false], ['N', false]])(
    '%s → %s', (input, expected) => expect(parseHasLine(input)).toBe(expected),
  )
  it('returns null for anything else', () => expect(parseHasLine('也許')).toBeNull())
})

describe('validateImportRow', () => {
  const TODAY = '2026-10-06'
  const raw = { name: ' 王小明　', birthDate: '79/1/31', phoneNumber: 912345678, lastVisitDate: '2026-04-01', hasLine: '是', comment: '' }

  it('returns clean data for a valid row', () => {
    expect(validateImportRow(raw, TODAY)).toEqual({
      data: { name: '王小明', birthDate: '1990-01-31', phoneNumber: '0912345678', lastVisitDate: '2026-04-01', hasLine: true, comment: null },
    })
  })

  it('reports each problem against its zh-TW column header', () => {
    const { errors } = validateImportRow(
      { name: '', birthDate: '1990-13-01', phoneNumber: '123', lastVisitDate: '2026-10-07', hasLine: '也許', comment: null },
      TODAY,
    )
    expect(errors).toEqual([
      { column: '姓名', message: '必填' },
      { column: '生日', message: '日期格式錯誤（例：1990-01-31 或 79/1/31）' },
      { column: '電話', message: '電話格式錯誤，應為 0 開頭的 9–10 位數字' },
      { column: '上次看診日', message: '上次看診日不可晚於今天' },
      { column: '有加 LINE', message: '請填「是」或「否」' },
    ])
  })
})
