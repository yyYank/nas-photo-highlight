import { execFile } from 'child_process'
import { copyFile, mkdtemp, rename, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { config } from '../config'
import { resolveFfmpegBin, resolveFfprobeBin } from '../infra/ffmpegBinary'

const execFileAsync = promisify(execFile)

const HIGHLIGHT_WIDTH = 1080
const HIGHLIGHT_HEIGHT = 1920
const HIGHLIGHT_FPS = 30
const HIGHLIGHT_AUDIO_RATE = 48000
const MAX_HIGHLIGHT_SECONDS = 60

export interface HighlightSegment {
  path: string
  type: 'image' | 'video'
}

export interface HighlightCommandPreview {
  outputPath: string
  command: string
  kind: 'segment' | 'concat'
}

export interface HighlightDryRunResult {
  commands: HighlightCommandPreview[]
}

export interface HighlightGenerationOptions {
  ffmpegThrottleMs?: number
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
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-shortest',
    '-t',
    `${secondsPerImage}`,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-r',
    `${HIGHLIGHT_FPS}`,
  ]
}

export function buildVideoSegmentOutputOptions(
  hasSourceAudio: boolean
): string[] {
  return [
    '-map',
    '0:v:0',
    '-map',
    hasSourceAudio ? '0:a:0' : '1:a:0',
    '-shortest',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-r',
    `${HIGHLIGHT_FPS}`,
  ]
}

export function buildFinalHighlightOutputOptions(): string[] {
  return [
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-t',
    `${MAX_HIGHLIGHT_SECONDS}`,
    '-movflags',
    '+faststart',
  ]
}

export function buildSilentAudioInputArgs(): string[] {
  return [
    '-f',
    'lavfi',
    '-i',
    `anullsrc=channel_layout=stereo:sample_rate=${HIGHLIGHT_AUDIO_RATE}`,
  ]
}

export function buildFfmpegThreadArgs(): string[] {
  return ['-threads', '1']
}

export function buildStagedOutputPath(
  tempDir: string,
  outputPath: string
): string {
  return path.join(tempDir, path.basename(outputPath))
}

export function buildCachedSegmentSourcePath(
  tempDir: string,
  index: number,
  sourcePath: string
): string {
  return path.join(
    tempDir,
    `source-${String(index).padStart(4, '0')}-${path.basename(sourcePath)}`
  )
}

export function shouldThrottleAfterFfmpegRun(
  completedRuns: number,
  totalRuns: number,
  ffmpegThrottleMs = 0
): boolean {
  return ffmpegThrottleMs > 0 && completedRuns + 1 < totalRuns
}

function quoteCommandArg(arg: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) {
    return arg
  }

  return `'${arg.replace(/'/g, String.raw`'\''`)}'`
}

function buildCommandPreview(args: string[]): string {
  return `ffmpeg ${args.map(quoteCommandArg).join(' ')}`
}

async function runFfmpeg(args: string[], outputPath: string): Promise<void> {
  console.log(`  ffmpeg: ${buildCommandPreview(args)}`)

  try {
    await execFileAsync(resolveFfmpegBin(), args, {
      maxBuffer: 1024 * 1024 * 50,
    })
  } catch (error) {
    if (outputPath !== '-') {
      await rm(outputPath, { force: true }).catch(() => undefined)
    }
    throw error
  }

  if (outputPath !== '-') {
    console.log(`  ✅ saved: ${outputPath}`)
  }
}

async function sleepBetweenFfmpegRuns(ffmpegThrottleMs = 0): Promise<void> {
  if (ffmpegThrottleMs <= 0) {
    return
  }

  console.log(`  ⏸️  throttling for ${ffmpegThrottleMs}ms`)
  await Bun.sleep(ffmpegThrottleMs)
}

async function promoteStagedFile(
  stagedPath: string,
  outputPath: string
): Promise<void> {
  const tmpOutputPath = `${outputPath}.part`

  try {
    await rm(tmpOutputPath, { force: true })
    await copyFile(stagedPath, tmpOutputPath)
    await rename(tmpOutputPath, outputPath)
  } catch (error) {
    await rm(tmpOutputPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function cacheSegmentSource(
  segment: HighlightSegment,
  tempDir: string,
  index: number
): Promise<HighlightSegment> {
  const cachedPath = buildCachedSegmentSourcePath(tempDir, index, segment.path)
  console.log(`  📥 caching source locally: ${segment.path}`)
  await copyFile(segment.path, cachedPath)
  return { ...segment, path: cachedPath }
}

async function detectAudioStream(inputPath: string): Promise<boolean> {
  const { stdout } = await execFileAsync(
    resolveFfprobeBin(),
    [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ],
    { maxBuffer: 1024 * 1024 * 10 }
  )

  return stdout
    .split('\n')
    .some((line) => line.trim().toLowerCase() === 'audio')
}

async function buildSegmentArgs(
  segment: HighlightSegment,
  outputPath: string
): Promise<string[]> {
  const args = [
    '-hide_banner',
    '-loglevel',
    'info',
    '-y',
    ...buildFfmpegThreadArgs(),
  ]

  if (segment.type === 'image') {
    args.push('-loop', '1', '-i', segment.path, ...buildSilentAudioInputArgs())
    args.push(
      '-vf',
      buildImageSegmentFilters(config.processing.secondsPerImage).join(','),
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-ar',
      `${HIGHLIGHT_AUDIO_RATE}`,
      '-ac',
      '2',
      ...buildImageSegmentOutputOptions(config.processing.secondsPerImage),
      outputPath
    )
    return args
  }

  const hasSourceAudio = await detectAudioStream(segment.path)
  args.push('-i', segment.path)
  if (!hasSourceAudio) {
    args.push(...buildSilentAudioInputArgs())
  }

  args.push(
    '-vf',
    buildVideoSegmentFilters().join(','),
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-ar',
    `${HIGHLIGHT_AUDIO_RATE}`,
    '-ac',
    '2',
    ...buildVideoSegmentOutputOptions(hasSourceAudio),
    outputPath
  )

  return args
}

function buildConcatArgs(
  listPath: string,
  outputPath: string,
  dryRun: boolean
): string[] {
  const args = [
    '-hide_banner',
    '-loglevel',
    'info',
    '-y',
    ...buildFfmpegThreadArgs(),
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
  ]

  if (config.bgmPath) {
    args.push('-i', config.bgmPath)
    args.push(
      '-filter_complex',
      '[0:a][1:a]amix=inputs=2:duration=first[aout]',
      '-map',
      '0:v:0',
      '-map',
      '[aout]',
      '-c:a',
      'aac',
      '-ar',
      `${HIGHLIGHT_AUDIO_RATE}`,
      '-ac',
      '2',
      '-t',
      `${MAX_HIGHLIGHT_SECONDS}`
    )

    if (dryRun) {
      args.push('-f', 'null', outputPath)
      return args
    }

    args.push('-c:v', 'copy', '-movflags', '+faststart', outputPath)
    return args
  }

  if (dryRun) {
    args.push(
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-t',
      `${MAX_HIGHLIGHT_SECONDS}`,
      '-f',
      'null',
      outputPath
    )
    return args
  }

  args.push(...buildFinalHighlightOutputOptions(), '-c', 'copy', outputPath)
  return args
}

async function concatSegmentClips(
  segmentPaths: string[],
  tempDir: string,
  outputPath: string
): Promise<void> {
  const listPath = path.join(tempDir, 'concat-list.txt')
  const stagedOutputPath = buildStagedOutputPath(tempDir, outputPath)
  await writeFile(listPath, buildConcatListContent(segmentPaths), 'utf8')

  try {
    await runFfmpeg(
      buildConcatArgs(listPath, stagedOutputPath, false),
      stagedOutputPath
    )
    await promoteStagedFile(stagedOutputPath, outputPath)
    console.log(`  ✅ promoted to NAS: ${outputPath}`)
  } finally {
    await rm(listPath, { force: true })
    await rm(stagedOutputPath, { force: true }).catch(() => undefined)
  }
}

export async function buildHighlightCommandPreviews(
  segments: HighlightSegment[],
  outputPath: string
): Promise<HighlightCommandPreview[]> {
  const tempDir = path.join(os.tmpdir(), 'nas-photo-highlight-render-preview')
  const previews: HighlightCommandPreview[] = []
  const segmentPaths: string[] = []

  for (const [index, segment] of segments.entries()) {
    const segmentOutputPath = path.join(
      tempDir,
      `segment-${String(index).padStart(4, '0')}.mp4`
    )
    const args = await buildSegmentArgs(segment, segmentOutputPath)
    previews.push({
      command: buildCommandPreview(args),
      kind: 'segment',
      outputPath: segmentOutputPath,
    })
    segmentPaths.push(segmentOutputPath)
  }

  const listPath = path.join(tempDir, 'concat-list.txt')
  previews.push({
    command: buildCommandPreview(buildConcatArgs(listPath, outputPath, false)),
    kind: 'concat',
    outputPath,
  })

  return previews
}

export async function runHighlightDryRun(
  segments: HighlightSegment[],
  outputPath: string,
  options: HighlightGenerationOptions = {}
): Promise<HighlightDryRunResult> {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), 'nas-photo-highlight-dry-run-')
  )

  try {
    const commands: HighlightCommandPreview[] = []
    const renderedSegmentPaths: string[] = []

    for (const [index, segment] of segments.entries()) {
      const cachedSegment = await cacheSegmentSource(segment, tempDir, index)
      const segmentOutputPath = path.join(
        tempDir,
        `segment-${String(index).padStart(4, '0')}.mp4`
      )
      const args = await buildSegmentArgs(cachedSegment, segmentOutputPath)
      commands.push({
        command: buildCommandPreview(args),
        kind: 'segment',
        outputPath: segmentOutputPath,
      })
      await runFfmpeg(args, segmentOutputPath)
      renderedSegmentPaths.push(segmentOutputPath)
      if (
        shouldThrottleAfterFfmpegRun(
          index,
          segments.length + 1,
          options.ffmpegThrottleMs
        )
      ) {
        await sleepBetweenFfmpegRuns(options.ffmpegThrottleMs)
      }
    }

    const listPath = path.join(tempDir, 'concat-list.txt')
    await writeFile(
      listPath,
      buildConcatListContent(renderedSegmentPaths),
      'utf8'
    )

    const verifyArgs = buildConcatArgs(listPath, '-', true)
    commands.push({
      command: buildCommandPreview(verifyArgs),
      kind: 'concat',
      outputPath,
    })
    await runFfmpeg(verifyArgs, '-')

    return { commands }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export async function generateHighlight(
  segments: HighlightSegment[],
  outputPath: string,
  options: HighlightGenerationOptions = {}
): Promise<void> {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), 'nas-photo-highlight-render-')
  )

  try {
    const renderedSegmentPaths: string[] = []

    for (const [index, segment] of segments.entries()) {
      const cachedSegment = await cacheSegmentSource(segment, tempDir, index)
      const segmentOutputPath = path.join(
        tempDir,
        `segment-${String(index).padStart(4, '0')}.mp4`
      )
      const args = await buildSegmentArgs(cachedSegment, segmentOutputPath)
      await runFfmpeg(args, segmentOutputPath)
      renderedSegmentPaths.push(segmentOutputPath)
      if (
        shouldThrottleAfterFfmpegRun(
          index,
          segments.length + 1,
          options.ffmpegThrottleMs
        )
      ) {
        await sleepBetweenFfmpegRuns(options.ffmpegThrottleMs)
      }
    }

    await concatSegmentClips(renderedSegmentPaths, tempDir, outputPath)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
