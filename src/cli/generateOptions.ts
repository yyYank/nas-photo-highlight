export interface GenerateOptions {
  dateFrom?: string
  dateTo?: string
  dryRun: boolean
  force: boolean
  inputListPath?: string
  notify: boolean
  runNow: boolean
}

function validateDateArg(flag: '--from' | '--to', value?: string) {
  if (!value) {
    throw new Error(`${flag} requires a YYYY-MM-DD value`)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must be in YYYY-MM-DD format`)
  }
}

export function parseGenerateOptions(args: string[]): GenerateOptions {
  const inputListIndex = args.indexOf('--input-list')
  const inputListPath =
    inputListIndex >= 0 ? args[inputListIndex + 1] : undefined
  const fromIndex = args.indexOf('--from')
  const dateFrom = fromIndex >= 0 ? args[fromIndex + 1] : undefined
  const toIndex = args.indexOf('--to')
  const dateTo = toIndex >= 0 ? args[toIndex + 1] : undefined

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

  return {
    dateFrom,
    dateTo,
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    inputListPath,
    notify: args.includes('--notify'),
    runNow: args.includes('--run-now'),
  }
}
