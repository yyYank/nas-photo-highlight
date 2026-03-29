import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import exifr from 'exifr'
import { config } from '../config.js'

export type ImageGroup = Map<string, string[]>

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.mts', '.m2ts', '.webm'])

export function isImagePath(file: string): boolean {
  return IMAGE_EXTS.has(path.extname(file).toLowerCase())
}

export function isVideoPath(file: string): boolean {
  return VIDEO_EXTS.has(path.extname(file).toLowerCase())
}

function isSupportedMedia(file: string): boolean {
  return isImagePath(file) || isVideoPath(file)
}

export function readInputList(inputListPath: string): string[] {
  return readFileSync(inputListPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Recursively collect all supported media paths under a directory */
function collectMedia(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectMedia(full))
    } else if (entry.isFile() && isSupportedMedia(entry.name)) {
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

async function sortGroupMedia(
  mediaPaths: string[],
  getCapturedAtFn: (mediaPath: string) => Promise<Date>
) {
  const dated = await Promise.all(mediaPaths.map(async (mediaPath, index) => ({
    mediaPath,
    capturedAt: await getCapturedAtFn(mediaPath),
    index,
  })))

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
export async function groupImages(inputListPath?: string): Promise<ImageGroup> {
  const allMedia = inputListPath
    ? readInputList(inputListPath)
    : collectMedia(config.nas.photoPath)

  if (inputListPath) {
    console.log(`Found ${allMedia.length} media files in input list ${inputListPath}`)
  } else {
    console.log(`Found ${allMedia.length} media files in ${config.nas.photoPath}`)
  }

  return groupListedMedia(allMedia, config.processing.groupBy)
}
