import { execFile } from 'child_process'
import { rm } from 'fs/promises'
import { promisify } from 'util'
import sharp from 'sharp'
import { resolveFfmpegBin } from '../infra/ffmpegBinary'
import { buildFfmpegThreadArgs, type HighlightSegment } from './highlight'

const execFileAsync = promisify(execFile)

const THUMBNAIL_WIDTH = 640
const THUMBNAIL_HEIGHT = 360

export function buildVideoThumbnailFilters(): string[] {
  return [
    `scale=${THUMBNAIL_WIDTH}:${THUMBNAIL_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${THUMBNAIL_WIDTH}:${THUMBNAIL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
  ]
}

export async function generateHighlightThumbnail(
  source: HighlightSegment,
  outputPath: string
): Promise<void> {
  if (source.type === 'image') {
    await sharp(source.path)
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
        fit: 'cover',
        position: 'centre',
      })
      .jpeg({ mozjpeg: true, quality: 82 })
      .toFile(outputPath)
    return
  }

  try {
    await execFileAsync(
      resolveFfmpegBin(),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        ...buildFfmpegThreadArgs(),
        '-ss',
        '0',
        '-i',
        source.path,
        '-frames:v',
        '1',
        '-vf',
        buildVideoThumbnailFilters().join(','),
        outputPath,
      ],
      { maxBuffer: 1024 * 1024 * 20 }
    )
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined)
    throw error
  }
}
