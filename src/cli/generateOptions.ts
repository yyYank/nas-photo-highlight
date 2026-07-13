export const DEFAULT_FFMPEG_THROTTLE_MS = 5000

export type GenerateSpan = 'daily' | 'weekly'

export interface GenerateOptions {
  dateFrom?: string
  dateTo?: string
  dryRun: boolean
  ffmpegThrottleMs?: number
  force: boolean
  inputListPath?: string
  month?: number
  notify: boolean
  runNow: boolean
  span: GenerateSpan
  year?: number
}

function validateDateArg(flag: '--from' | '--to', value?: string) {
  if (!value) {
    throw new Error(`${flag} requires a YYYY-MM-DD value`)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must be in YYYY-MM-DD format`)
  }
}

function parseNonNegativeIntegerArg(
  flag: '--ffmpeg-throttle-ms',
  value?: string
): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`${flag} must be a non-negative integer`)
  }

  return Number.parseInt(value, 10)
}

function validateSpanArg(value?: string): GenerateSpan {
  if (value === undefined) return 'daily'
  if (value !== 'daily' && value !== 'weekly') {
    throw new Error('--span must be "daily" or "weekly"')
  }
  return value
}

function parseMonthArg(value?: string): number {
  if (!value || !/^\d{1,2}$/.test(value)) {
    throw new Error('--month must be a number between 1 and 12')
  }

  const month = Number.parseInt(value, 10)
  if (month < 1 || month > 12) {
    throw new Error('--month must be a number between 1 and 12')
  }

  return month
}

function parseYearArg(value?: string): number {
  if (!value || !/^\d{4}$/.test(value)) {
    throw new Error('--year must be a 4-digit year')
  }

  return Number.parseInt(value, 10)
}

export function parseGenerateOptions(args: string[]): GenerateOptions {
  const inputListIndex = args.indexOf('--input-list')
  const inputListPath =
    inputListIndex >= 0 ? args[inputListIndex + 1] : undefined
  const fromIndex = args.indexOf('--from')
  const dateFrom = fromIndex >= 0 ? args[fromIndex + 1] : undefined
  const toIndex = args.indexOf('--to')
  const dateTo = toIndex >= 0 ? args[toIndex + 1] : undefined
  const throttleIndex = args.indexOf('--ffmpeg-throttle-ms')
  const ffmpegThrottleMs =
    throttleIndex >= 0
      ? parseNonNegativeIntegerArg(
          '--ffmpeg-throttle-ms',
          args[throttleIndex + 1]
        )
      : DEFAULT_FFMPEG_THROTTLE_MS

  const spanIndex = args.indexOf('--span')
  const span = validateSpanArg(spanIndex >= 0 ? args[spanIndex + 1] : undefined)

  const monthIndex = args.indexOf('--month')
  const month =
    monthIndex >= 0 ? parseMonthArg(args[monthIndex + 1]) : undefined

  const yearIndex = args.indexOf('--year')
  const year = yearIndex >= 0 ? parseYearArg(args[yearIndex + 1]) : undefined

  if (inputListIndex >= 0 && !inputListPath) {
    throw new Error(
      'Usage: bun run generate --input-list /path/to/input-files.txt'
    )
  }

  if (fromIndex >= 0) validateDateArg('--from', dateFrom)
  if (toIndex >= 0) validateDateArg('--to', dateTo)

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('--from must be earlier than or equal to --to')
  }

  if (span === 'weekly') {
    if (month === undefined) {
      throw new Error('--span weekly requires --month <1-12>')
    }
    if (fromIndex >= 0 || toIndex >= 0) {
      throw new Error('--span weekly cannot be combined with --from/--to')
    }
  }

  return {
    dateFrom,
    dateTo,
    dryRun: args.includes('--dry-run'),
    ffmpegThrottleMs,
    force: args.includes('--force'),
    inputListPath,
    month,
    notify: args.includes('--notify'),
    runNow: args.includes('--run-now'),
    span,
    year: year ?? (span === 'weekly' ? new Date().getFullYear() : undefined),
  }
}
