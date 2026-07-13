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
      span: 'daily',
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
      span: 'daily',
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
      span: 'daily',
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

  it('span を省略したら daily になる', () => {
    expect(parseGenerateOptions(['--run-now']).span).toBe('daily')
  })

  it('--span weekly --month --year を解釈する', () => {
    const options = parseGenerateOptions([
      '--run-now',
      '--span',
      'weekly',
      '--month',
      '4',
      '--year',
      '2026',
    ])

    expect(options.span).toBe('weekly')
    expect(options.month).toBe(4)
    expect(options.year).toBe(2026)
  })

  it('--span weekly で --year を省略したら現在年を使う', () => {
    const options = parseGenerateOptions([
      '--run-now',
      '--span',
      'weekly',
      '--month',
      '4',
    ])

    expect(options.span).toBe('weekly')
    expect(options.year).toBe(new Date().getFullYear())
  })

  it('--span に不正な値を渡すと失敗する', () => {
    expect(() => parseGenerateOptions(['--span', 'monthly'])).toThrow(
      '--span must be "daily" or "weekly"'
    )
  })

  it('--span weekly なのに --month がないと失敗する', () => {
    expect(() => parseGenerateOptions(['--span', 'weekly'])).toThrow(
      '--span weekly requires --month <1-12>'
    )
  })

  it('--month が範囲外だと失敗する', () => {
    expect(() =>
      parseGenerateOptions(['--span', 'weekly', '--month', '13'])
    ).toThrow('--month must be a number between 1 and 12')
  })

  it('--span weekly と --from/--to の併用は失敗する', () => {
    expect(() =>
      parseGenerateOptions([
        '--span',
        'weekly',
        '--month',
        '4',
        '--from',
        '2026-04-01',
      ])
    ).toThrow('--span weekly cannot be combined with --from/--to')

    expect(() =>
      parseGenerateOptions([
        '--span',
        'weekly',
        '--month',
        '4',
        '--to',
        '2026-04-30',
      ])
    ).toThrow('--span weekly cannot be combined with --from/--to')
  })
})
