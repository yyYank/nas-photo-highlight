import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import exifr from 'exifr'
import { config } from '../config'

export type ImageGroup = Map<string, string[]>
export interface MediaDateRange {
  dateFrom?: string
  dateTo?: string
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])
const VIDEO_EXTS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.avi',
  '.mts',
  '.m2ts',
  '.webm',
])

export function isImagePath(file: string): boolean {
  return IMAGE_EXTS.has(path.extname(file).toLowerCase())
}

export function isVideoPath(file: string): boolean {
  return VIDEO_EXTS.has(path.extname(file).toLowerCase())
}

function isSupportedMedia(file: string): boolean {
  return isImagePath(file) || isVideoPath(file)
}

function isGeneratedArtifactPath(file: string): boolean {
  const normalized = path.basename(file).toLowerCase()
  return (
    normalized.endsWith('_highlight.mp4') ||
    normalized.endsWith('_highlight_thumb.jpg')
  )
}

export function readInputList(inputListPath: string): string[] {
  return readFileSync(inputListPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Recursively collect all supported media paths under a directory */
export function collectMedia(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectMedia(full))
    } else if (
      entry.isFile() &&
      isSupportedMedia(entry.name) &&
      !isGeneratedArtifactPath(entry.name)
    ) {
      results.push(full)
    }
  }
  return results
}

async function getCapturedAt(mediaPath: string): Promise<Date> {
  try {
    if (isImagePath(mediaPath)) {
      const exif = await exifr.parse(mediaPath, ['DateTimeOriginal'])
      if (exif?.DateTimeOriginal) {
        return new Date(exif.DateTimeOriginal)
      }
    }
  } catch {}
  return statSync(mediaPath).mtime
}

/** Extract date string (YYYY-MM-DD) from EXIF or fallback to file mtime */
async function getDateKey(mediaPath: string): Promise<string> {
  try {
    if (isImagePath(mediaPath)) {
      const exif = await exifr.parse(mediaPath, ['DateTimeOriginal'])
      if (exif?.DateTimeOriginal) {
        const d = new Date(exif.DateTimeOriginal)
        return d.toISOString().slice(0, 10)
      }
    }
  } catch {}
  const mtime = statSync(mediaPath).mtime
  return mtime.toISOString().slice(0, 10)
}

export async function filterMediaByDateRange(
  mediaPaths: string[],
  range: MediaDateRange,
  getDateKeyFn: (mediaPath: string) => Promise<string> = getDateKey
): Promise<string[]> {
  if (!range.dateFrom && !range.dateTo) {
    return mediaPaths
  }

  const filtered: string[] = []
  for (const mediaPath of mediaPaths) {
    const dateKey = await getDateKeyFn(mediaPath)
    if (range.dateFrom && dateKey < range.dateFrom) {
      continue
    }

    if (range.dateTo && dateKey > range.dateTo) {
      continue
    }

    filtered.push(mediaPath)
  }

  return filtered
}

async function sortGroupMedia(
  mediaPaths: string[],
  getCapturedAtFn: (mediaPath: string) => Promise<Date>
) {
  const dated = await Promise.all(
    mediaPaths.map(async (mediaPath, index) => ({
      mediaPath,
      capturedAt: await getCapturedAtFn(mediaPath),
      index,
    }))
  )

  dated.sort((a, b) => {
    const timeDiff = a.capturedAt.getTime() - b.capturedAt.getTime()
    if (timeDiff !== 0) return timeDiff
    return a.index - b.index
  })

  return dated.map((item) => item.mediaPath)
}

export async function groupListedMedia(
  mediaPaths: string[],
  groupBy: 'date' | 'folder',
  getDateKeyFn: (mediaPath: string) => Promise<string> = getDateKey,
  getCapturedAtFn: (mediaPath: string) => Promise<Date> = getCapturedAt
): Promise<ImageGroup> {
  const groups: ImageGroup = new Map()

  if (groupBy === 'folder') {
    for (const p of mediaPaths) {
      const key = path.basename(path.dirname(p))
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
  } else {
    for (const p of mediaPaths) {
      const key = await getDateKeyFn(p)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
  }

  for (const [key, groupedPaths] of groups) {
    groups.set(key, await sortGroupMedia(groupedPaths, getCapturedAtFn))
  }

  return groups
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Convert a "YYYY-MM-DD" date key into a "YYYY-MM-wN" week-of-month key.
 * The month is split into 4 weeks: w1=1-7, w2=8-14, w3=15-21, w4=22-末日.
 */
export function weekKeyFromDateKey(dateKey: string): string {
  const match = DATE_KEY_PATTERN.exec(dateKey)
  if (!match) {
    throw new Error(`weekKeyFromDateKey: invalid date key "${dateKey}"`)
  }

  const [, yyyy, mm, dd] = match
  const day = Number.parseInt(dd, 10)
  const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4

  return `${yyyy}-${mm}-w${week}`
}

/**
 * Group media captured within a specific year/month into 4 weekly groups
 * (groupKey: "YYYY-MM-wN"). Media outside the target month are excluded.
 * Within each week, media stay ordered by capture time (day groups are
 * concatenated in chronological/date-key order).
 */
export async function groupMediaByWeek(
  mediaPaths: string[],
  year: number,
  month: number,
  getDateKeyFn: (mediaPath: string) => Promise<string> = getDateKey,
  getCapturedAtFn: (mediaPath: string) => Promise<Date> = getCapturedAt
): Promise<ImageGroup> {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`

  const mediaInMonth: string[] = []
  for (const mediaPath of mediaPaths) {
    const dateKey = await getDateKeyFn(mediaPath)
    if (dateKey.startsWith(monthPrefix)) {
      mediaInMonth.push(mediaPath)
    }
  }

  const dateGroups = await groupListedMedia(
    mediaInMonth,
    'date',
    getDateKeyFn,
    getCapturedAtFn
  )

  const weekGroups: ImageGroup = new Map()
  for (const dateKey of Array.from(dateGroups.keys()).sort()) {
    const weekKey = weekKeyFromDateKey(dateKey)
    const existing = weekGroups.get(weekKey) ?? []
    weekGroups.set(weekKey, existing.concat(dateGroups.get(dateKey)!))
  }

  return weekGroups
}

export async function groupListedImages(
  imagePaths: string[],
  groupBy: 'date' | 'folder',
  getDateKeyFn: (imagePath: string) => Promise<string> = getDateKey,
  getCapturedAtFn: (imagePath: string) => Promise<Date> = getCapturedAt
): Promise<ImageGroup> {
  return groupListedMedia(imagePaths, groupBy, getDateKeyFn, getCapturedAtFn)
}

/**
 * Group supported media under NAS_PHOTO_PATH by date (YYYY-MM-DD) or by subfolder.
 * Returns a Map of groupKey → [mediaPaths]
 */
export async function groupImages({
  inputListPath,
  dateFrom,
  dateTo,
  span = 'daily',
  month,
  year,
}: MediaDateRange & {
  inputListPath?: string
  span?: 'daily' | 'weekly'
  month?: number
  year?: number
} = {}): Promise<ImageGroup> {
  const allMedia = inputListPath
    ? readInputList(inputListPath)
    : collectMedia(config.nas.photoPath)

  if (span === 'weekly') {
    if (!month) {
      throw new Error('groupImages: month is required when span is "weekly"')
    }

    const resolvedYear = year ?? new Date().getFullYear()
    const weekGroups = await groupMediaByWeek(allMedia, resolvedYear, month)
    const mediaInMonth = Array.from(weekGroups.values()).reduce(
      (sum, paths) => sum + paths.length,
      0
    )

    if (inputListPath) {
      console.log(
        `Found ${mediaInMonth} media files in input list ${inputListPath} for ${resolvedYear}-${String(month).padStart(2, '0')}`
      )
    } else {
      console.log(
        `Found ${mediaInMonth} media files in ${config.nas.photoPath} for ${resolvedYear}-${String(month).padStart(2, '0')}`
      )
    }

    return weekGroups
  }

  const filteredMedia = await filterMediaByDateRange(allMedia, {
    dateFrom,
    dateTo,
  })

  if (inputListPath) {
    console.log(
      `Found ${filteredMedia.length} media files in input list ${inputListPath}`
    )
  } else {
    console.log(
      `Found ${filteredMedia.length} media files in ${config.nas.photoPath}`
    )
  }

  return groupListedMedia(filteredMedia, config.processing.groupBy)
}
