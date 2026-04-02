import { describe, expect, it } from 'bun:test'
import { parseGenerateOptions } from '../src/cli/generateOptions'

describe('parseGenerateOptions', () => {
  it('from と to を含む generate 引数を解釈する', () => {
    expect(
      parseGenerateOptions([
        '--run-now',
        '--dry-run',
        '--force',
        '--from',
        '2026-03-01',
        '--to',
        '2026-03-07',
      ])
    ).toEqual({
      dateFrom: '2026-03-01',
      dateTo: '2026-03-07',
      dryRun: true,
      ffmpegThrottleMs: 5000,
      force: true,
      inputListPath: undefined,
      notify: false,
      runNow: true,
    })
  })

  it('日付形式が不正なら失敗する', () => {
    expect(() => parseGenerateOptions(['--from', '2026/03/01'])).toThrow(
      '--from must be in YYYY-MM-DD format'
    )
    expect(() => parseGenerateOptions(['--to', '03-07-2026'])).toThrow(
      '--to must be in YYYY-MM-DD format'
    )
  })

  it('from が to より後なら失敗する', () => {
    expect(() =>
      parseGenerateOptions(['--from', '2026-03-08', '--to', '2026-03-07'])
    ).toThrow('--from must be earlier than or equal to --to')
  })

  it('input-list も併用できる', () => {
    expect(
      parseGenerateOptions([
        '--run-now',
        '--input-list',
        '/tmp/input-list.txt',
        '--from',
        '2026-03-01',
      ])
    ).toEqual({
      dateFrom: '2026-03-01',
      dateTo: undefined,
      dryRun: false,
      ffmpegThrottleMs: 5000,
      force: false,
      inputListPath: '/tmp/input-list.txt',
      notify: false,
      runNow: true,
    })
  })

  it('ffmpeg throttle ms を解釈する', () => {
    expect(
      parseGenerateOptions([
        '--run-now',
        '--force',
        '--ffmpeg-throttle-ms',
        '1500',
      ])
    ).toEqual({
      dateFrom: undefined,
      dateTo: undefined,
      dryRun: false,
      ffmpegThrottleMs: 1500,
      force: true,
      inputListPath: undefined,
      notify: false,
      runNow: true,
    })
  })

  it('ffmpeg throttle ms が負数なら失敗する', () => {
    expect(() =>
      parseGenerateOptions(['--ffmpeg-throttle-ms', '-1'])
    ).toThrow('--ffmpeg-throttle-ms must be a non-negative integer')
  })

  it('ffmpeg throttle ms を省略したらデフォルト値を使う', () => {
    expect(parseGenerateOptions(['--run-now']).ffmpegThrottleMs).toBe(5000)
  })
})
