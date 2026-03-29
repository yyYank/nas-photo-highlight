import ffmpeg from 'fluent-ffmpeg'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { config } from '../config'

const HIGHLIGHT_WIDTH = 1080
const HIGHLIGHT_HEIGHT = 1920
const HIGHLIGHT_FPS = 30
const MAX_HIGHLIGHT_SECONDS = 60

export interface HighlightSegment {
  path: string
  type: 'image' | 'video'
}

export function buildImageSegmentFilters(secondsPerImage: number): string[] {
  return [
    `scale=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.001))':d=${secondsPerImage * HIGHLIGHT_FPS}:s=${HIGHLIGHT_WIDTH}x${HIGHLIGHT_HEIGHT}:fps=${HIGHLIGHT_FPS}`,
    'setsar=1',
    'format=yuv420p',
  ]
}

export function buildVideoSegmentFilters(): string[] {
  return [
    `scale=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `fps=${HIGHLIGHT_FPS}`,
    'setsar=1',
    'setpts=PTS-STARTPTS',
    'format=yuv420p',
  ]
}

export function buildConcatListContent(segmentPaths: string[]): string {
  const lines = segmentPaths.map((segmentPath) => {
    const escapedPath = segmentPath.replace(/'/g, "'\\''")
    return `file '${escapedPath}'`
  })

  return `${lines.join('\n')}\n`
}

export function buildImageSegmentOutputOptions(
  secondsPerImage: number
): string[] {
  return [
    '-map 0:v:0',
    '-map 1:a:0',
    '-shortest',
    `-t ${secondsPerImage}`,
    '-pix_fmt yuv420p',
    '-movflags +faststart',
    `-r ${HIGHLIGHT_FPS}`,
  ]
}

export function buildVideoSegmentOutputOptions(
  hasSourceAudio: boolean
): string[] {
  return [
    '-map 0:v:0',
    hasSourceAudio ? '-map 0:a:0' : '-map 1:a:0',
    '-shortest',
    '-pix_fmt yuv420p',
    '-movflags +faststart',
    `-r ${HIGHLIGHT_FPS}`,
  ]
}

export function buildFinalHighlightOutputOptions(): string[] {
  return [
    '-map 0:v:0',
    '-map 0:a:0',
    `-t ${MAX_HIGHLIGHT_SECONDS}`,
    '-pix_fmt yuv420p',
    '-movflags +faststart',
    `-r ${HIGHLIGHT_FPS}`,
  ]
}

function runFfmpegCommand(
  command: ffmpeg.FfmpegCommand,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    command
      .output(outputPath)
      .on('start', (cmdLine) => console.log(`  ffmpeg: ${cmdLine}`))
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r  encoding: ${Math.round(progress.percent)}%`)
        }
      })
      .on('end', () => {
        console.log(`\n  ✅ saved: ${outputPath}`)
        resolve()
      })
      .on('error', (error) => {
        rm(outputPath, { force: true })
          .catch(() => undefined)
          .finally(() => {
            reject(error)
          })
      })
      .run()
  })
}

function detectAudioStream(inputPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) {
        reject(error)
        return
      }

      resolve(metadata.streams.some((stream) => stream.codec_type === 'audio'))
    })
  })
}

async function renderSegmentClip(
  segment: HighlightSegment,
  outputPath: string
): Promise<void> {
  let command = ffmpeg().input(segment.path)

  if (segment.type === 'image') {
    command = command
      .inputOptions(['-loop 1'])
      .input('anullsrc=channel_layout=stereo:sample_rate=48000')
      .inputFormat('lavfi')
      .videoFilters(buildImageSegmentFilters(config.processing.secondsPerImage))
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioFrequency(48000)
      .audioChannels(2)
      .outputOptions(
        buildImageSegmentOutputOptions(config.processing.secondsPerImage)
      )

    await runFfmpegCommand(command, outputPath)
    return
  }

  const hasSourceAudio = await detectAudioStream(segment.path)

  command = command.videoFilters(buildVideoSegmentFilters())

  if (!hasSourceAudio) {
    command = command
      .input('anullsrc=channel_layout=stereo:sample_rate=48000')
      .inputFormat('lavfi')
  }

  command = command
    .videoCodec('libx264')
    .audioCodec('aac')
    .audioFrequency(48000)
    .audioChannels(2)
    .outputOptions(buildVideoSegmentOutputOptions(hasSourceAudio))

  await runFfmpegCommand(command, outputPath)
}

async function concatSegmentClips(
  segmentPaths: string[],
  outputPath: string
): Promise<void> {
  const listPath = path.join(
    path.dirname(outputPath),
    `.concat-${path.basename(outputPath)}.txt`
  )
  await writeFile(listPath, buildConcatListContent(segmentPaths), 'utf8')

  try {
    let command = ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioFrequency(48000)
      .audioChannels(2)
      .outputOptions(buildFinalHighlightOutputOptions())

    if (config.bgmPath) {
      command = command
        .input(config.bgmPath)
        .audioCodec('aac')
        .audioBitrate('192k')
    }

    await runFfmpegCommand(command, outputPath)
  } finally {
    await rm(listPath, { force: true })
  }
}

/**
 * Generate a highlight movie from image/video segments.
 * Each segment is normalized to a playable mp4 clip before final concat.
 */
export async function generateHighlight(
  segments: HighlightSegment[],
  outputPath: string
): Promise<void> {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), 'nas-photo-highlight-render-')
  )

  try {
    const renderedSegmentPaths: string[] = []

    for (const [index, segment] of segments.entries()) {
      const segmentOutputPath = path.join(
        tempDir,
        `segment-${String(index).padStart(4, '0')}.mp4`
      )
      await renderSegmentClip(segment, segmentOutputPath)
      renderedSegmentPaths.push(segmentOutputPath)
    }

    await concatSegmentClips(renderedSegmentPaths, outputPath)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
