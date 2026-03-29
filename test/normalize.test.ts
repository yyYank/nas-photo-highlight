import { describe, expect, it } from 'bun:test'
import { normalizeByPercentile, percentile } from '../src/core/normalize'

describe('percentile', () => {
  it('線形補間で percentile を計算する', () => {
    expect(percentile([0, 10, 20, 30], 0.5)).toBe(15)
  })
})

describe('normalizeByPercentile', () => {
  it('p10-p90 を基準に 0-1 正規化する', () => {
    expect(normalizeByPercentile([0, 10, 20, 30, 40])).toEqual([
      0, 0.1875, 0.5, 0.8125, 1,
    ])
  })
})
