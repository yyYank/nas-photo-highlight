import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import exifr from 'exifr'
import { config } from '../config.js'

export type ImageGroup = Map<string, string[]>

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])

function isImage(file: string): boolean {
  return IMAGE_EXTS.has(path.extname(file).toLowerCase())
}

export function readInputList(inputListPath: string): string[] {
  return readFileSync(inputListPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Recursively collect all image paths under a directory */
function collectImages(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectImages(full))
    } else if (entry.isFile() && isImage(entry.name)) {
      results.push(full)
    }
  }
  return results
}

/** Extract date string (YYYY-MM-DD) from EXIF or fallback to file mtime */
async function getDateKey(imagePath: string): Promise<string> {
  try {
    const exif = await exifr.parse(imagePath, ['DateTimeOriginal'])
    if (exif?.DateTimeOriginal) {
      const d = new Date(exif.DateTimeOriginal)
      return d.toISOString().slice(0, 10)
    }
  } catch {}
  const mtime = statSync(imagePath).mtime
  return mtime.toISOString().slice(0, 10)
}

export async function groupListedImages(
  imagePaths: string[],
  groupBy: 'date' | 'folder',
  getDateKeyFn: (imagePath: string) => Promise<string> = getDateKey
): Promise<ImageGroup> {
  const groups: ImageGroup = new Map()

  if (groupBy === 'folder') {
    for (const p of imagePaths) {
      const key = path.basename(path.dirname(p))
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    return groups
  }

  for (const p of imagePaths) {
    const key = await getDateKeyFn(p)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }

  return groups
}

/**
 * Group images under NAS_PHOTO_PATH by date (YYYY-MM-DD) or by subfolder.
 * Returns a Map of groupKey → [imagePaths]
 */
export async function groupImages(inputListPath?: string): Promise<ImageGroup> {
  const allImages = inputListPath
    ? readInputList(inputListPath)
    : collectImages(config.nas.photoPath)

  if (inputListPath) {
    console.log(`Found ${allImages.length} images in input list ${inputListPath}`)
  } else {
    console.log(`Found ${allImages.length} images in ${config.nas.photoPath}`)
  }

  return groupListedImages(allImages, config.processing.groupBy)
}
