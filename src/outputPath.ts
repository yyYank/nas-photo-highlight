import { mkdirSync } from 'fs'
import { syncViewerAssets } from './viewerAssets'

interface PrepareOutputPathOptions {
  mkdir?: (path: string) => void
}

interface PrepareMetaOutputPathOptions extends PrepareOutputPathOptions {
  syncAssets?: (path: string) => void
}

export function resolveOutputPath(
  outputPathTemplate: string,
  currentDate: Date = new Date()
): string {
  const yyyy = String(currentDate.getFullYear())
  const mm = String(currentDate.getMonth() + 1).padStart(2, '0')

  return outputPathTemplate.replaceAll('{yyyy}', yyyy).replaceAll('{mm}', mm)
}

const GROUP_KEY_DATE_PATTERN = /^(\d{4})-(\d{2})-(?:\d{2}|w[1-4])$/

/**
 * Resolve {yyyy}/{mm} using the group's own capture date (groupKey, "YYYY-MM-DD"
 * or the weekly form "YYYY-MM-wN") so that a group's highlight always lands in
 * its own year/month folder, regardless of when the pipeline actually runs.
 *
 * Falls back to `fallbackDate` (実行日) when groupKey isn't in that shape —
 * e.g. GROUP_BY=folder, where groups are keyed by folder name.
 */
export function resolveOutputPathForGroup(
  outputPathTemplate: string,
  groupKey: string,
  fallbackDate: Date = new Date()
): string {
  const match = GROUP_KEY_DATE_PATTERN.exec(groupKey)
  const [yyyy, mm] = match
    ? [match[1], match[2]]
    : [
        String(fallbackDate.getFullYear()),
        String(fallbackDate.getMonth() + 1).padStart(2, '0'),
      ]

  return outputPathTemplate.replaceAll('{yyyy}', yyyy).replaceAll('{mm}', mm)
}

function explainOutputPathError(
  outputPath: string,
  error: NodeJS.ErrnoException
): Error {
  if (
    error.code === 'EACCES' ||
    error.code === 'EPERM' ||
    error.code === 'ENOENT'
  ) {
    return new Error(
      `NAS_OUTPUT_PATH "${outputPath}" を準備できませんでした。NAS が未マウントか、書き込み権限がありません。`
    )
  }

  return error
}

export function prepareOutputPath(
  outputPath: string,
  {
    mkdir = (target) => mkdirSync(target, { recursive: true }),
  }: PrepareOutputPathOptions = {}
) {
  try {
    mkdir(outputPath)
  } catch (error) {
    throw explainOutputPathError(outputPath, error as NodeJS.ErrnoException)
  }
}

export function prepareMetaOutputPath(
  outputPath: string,
  {
    mkdir = (target) => mkdirSync(target, { recursive: true }),
    syncAssets = syncViewerAssets,
  }: PrepareMetaOutputPathOptions = {}
) {
  try {
    mkdir(outputPath)
    syncAssets(outputPath)
  } catch (error) {
    throw explainOutputPathError(outputPath, error as NodeJS.ErrnoException)
  }
}
