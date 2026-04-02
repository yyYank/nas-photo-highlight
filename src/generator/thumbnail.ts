import { execFile } from 'child_process'
import { copyFile, mkdtemp, rename, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import sharp from 'sharp'
import { resolveFfmpegBin } from '../infra/ffmpegBinary'
import {
  buildFfmpegThreadArgs,
  buildStagedOutputPath,
  type HighlightSegment,
} from './highlight'

const execFileAsync = promisify(execFile)

const THUMBNAIL_WIDTH = 640
const THUMBNAIL_HEIGHT = 360

async function promoteStagedThumbnail(
  stagedOutputPath: string,
  outputPath: string
): Promise<void> {
  const tmpOutputPath = `${outputPath}.part`

  try {
    await rm(tmpOutputPath, { force: true })
    await copyFile(stagedOutputPath, tmpOutputPath)
    await rename(tmpOutputPath, outputPath)
  } catch (error) {
    await rm(tmpOutputPath, { force: true }).catch(() => undefined)
    throw error
  }
}

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nas-photo-highlight-thumb-'))
  const stagedOutputPath = buildStagedOutputPath(tempDir, outputPath)

  try {
    if (source.type === 'image') {
      await sharp(source.path)
        .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
          fit: 'cover',
          position: 'centre',
        })
        .jpeg({ mozjpeg: true, quality: 82 })
        .toFile(stagedOutputPath)
      await promoteStagedThumbnail(stagedOutputPath, outputPath)
      return
    }

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
        stagedOutputPath,
      ],
      { maxBuffer: 1024 * 1024 * 20 }
    )
    await promoteStagedThumbnail(stagedOutputPath, outputPath)
  } catch (error) {
    await rm(outputPath, { force: true }).catch(() => undefined)
    throw error
  } finally {
    await rm(path.dirname(stagedOutputPath), {
      recursive: true,
      force: true,
    }).catch(() => undefined)
  }
}
