import { describe, expect, it } from 'bun:test'
import { execFile } from 'child_process'
import { access, chmod, mkdtemp, rm, stat, writeFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import sharp from 'sharp'
import { config } from '../src/config'
import {
  generateHighlight,
  runHighlightDryRun,
  type HighlightSegment,
} from '../src/generator/highlight'

const execFileAsync = promisify(execFile)
const DOCKER_FFMPEG_IMAGE = 'jrottenberg/ffmpeg:6.1-alpine'
const hasLocalFfmpeg = Boolean(Bun.which('ffmpeg') && Bun.which('ffprobe'))
const hasDocker = Boolean(Bun.which('docker'))
const canRunIntegration = hasLocalFfmpeg || hasDocker
const integrationIt = canRunIntegration ? it : it.skip

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function withMediaBinaries<T>(
  workDir: string,
  fn: () => Promise<T>
): Promise<T> {
  const prevFfmpeg = process.env.FFMPEG_BIN
  const prevFfprobe = process.env.FFPROBE_BIN
  const prevNodeEnv = process.env.NODE_ENV
  const prevTmpDir = process.env.TMPDIR
  const containerName = `nas-photo-highlight-ffmpeg-test-${Date.now()}`

  if (!hasLocalFfmpeg) {
    const repoRoot = process.cwd()
    const ffmpegWrapper = path.join(workDir, 'ffmpeg-docker.sh')
    const ffprobeWrapper = path.join(workDir, 'ffprobe-docker.sh')

    await execFileAsync('docker', [
      'run',
      '-d',
      '--rm',
      '--name',
      containerName,
      '-v',
      `${repoRoot}:${repoRoot}`,
      '-w',
      repoRoot,
      '--entrypoint',
      'sh',
      DOCKER_FFMPEG_IMAGE,
      '-c',
      'while true; do sleep 3600; done',
    ])

    const wrapperTemplate = (binary: 'ffmpeg' | 'ffprobe') => `#!/bin/sh
set -eu
exec docker exec ${containerName} ${binary} "$@"
`
    await writeFile(ffmpegWrapper, wrapperTemplate('ffmpeg'), 'utf8')
    await writeFile(ffprobeWrapper, wrapperTemplate('ffprobe'), 'utf8')
    await chmod(ffmpegWrapper, 0o755)
    await chmod(ffprobeWrapper, 0o755)
    process.env.FFMPEG_BIN = ffmpegWrapper
    process.env.FFPROBE_BIN = ffprobeWrapper
  }

  process.env.NODE_ENV = 'test'
  process.env.TMPDIR = workDir

  try {
    return await fn()
  } finally {
    if (!hasLocalFfmpeg) {
      await execFileAsync('docker', ['rm', '-f', containerName]).catch(
        () => undefined
      )
    }
    process.env.FFMPEG_BIN = prevFfmpeg
    process.env.FFPROBE_BIN = prevFfprobe
    process.env.NODE_ENV = prevNodeEnv
    process.env.TMPDIR = prevTmpDir
  }
}

async function createImage(outputPath: string): Promise<void> {
  await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: {
        r: 220,
        g: 120,
        b: 40,
      },
    },
  })
    .png()
    .toFile(outputPath)
}

async function runMediaTool(command: string, args: string[]): Promise<void> {
  await execFileAsync(command, args, {
    maxBuffer: 1024 * 1024 * 50,
  })
}

async function createSampleVideo(
  ffmpegBin: string,
  outputPath: string,
  withAudio: boolean
): Promise<void> {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x180:rate=30',
  ]

  if (withAudio) {
    args.push('-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000')
  }

  args.push('-t', '1.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p')

  if (withAudio) {
    args.push('-c:a', 'aac', '-shortest')
  } else {
    args.push('-an')
  }

  args.push(outputPath)
  await runMediaTool(ffmpegBin, args)
}

async function probeMedia(
  ffprobeBin: string,
  outputPath: string
): Promise<{
  format: { duration?: string; format_name?: string }
  streams: Array<{ codec_type?: string }>
}> {
  const { stdout } = await execFileAsync(
    ffprobeBin,
    ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', outputPath],
    { maxBuffer: 1024 * 1024 * 10 }
  )

  return JSON.parse(stdout) as {
    format: { duration?: string; format_name?: string }
    streams: Array<{ codec_type?: string }>
  }
}

describe('highlight integration', () => {
  integrationIt(
    'ffmpeg 実行経路で generate と dry-run を検証する',
    async () => {
      const workDir = await mkdtemp(
        path.join(process.cwd(), '.tmp-highlight-integration-')
      )

      try {
        await withMediaBinaries(workDir, async () => {
          const originalSecondsPerImage = config.processing.secondsPerImage
          const processingConfig = config.processing as {
            secondsPerImage: number
          }
          const ffmpegBin = process.env.FFMPEG_BIN || 'ffmpeg'
          const ffprobeBin = process.env.FFPROBE_BIN || 'ffprobe'
          const imagePath = path.join(workDir, 'sample.png')
          const audioVideoPath = path.join(workDir, 'sample-audio.mp4')
          const mixedOutputPath = path.join(workDir, 'highlight-mixed.mp4')
          const dryRunOutputPath = path.join(workDir, 'dry-run-output.mp4')
          const mixedSegments: HighlightSegment[] = [
            { path: imagePath, type: 'image' },
            { path: audioVideoPath, type: 'video' },
          ]

          try {
            processingConfig.secondsPerImage = 1

            await createImage(imagePath)
            await createSampleVideo(ffmpegBin, audioVideoPath, true)

            await generateHighlight(mixedSegments, mixedOutputPath)

            expect(await fileExists(mixedOutputPath)).toBe(true)
            expect((await stat(mixedOutputPath)).size).toBeGreaterThan(0)

            const mixedProbe = await probeMedia(ffprobeBin, mixedOutputPath)

            expect(
              mixedProbe.streams.some((stream) => stream.codec_type === 'video')
            ).toBe(true)
            expect(
              mixedProbe.streams.some((stream) => stream.codec_type === 'audio')
            ).toBe(true)
            expect(mixedProbe.format.format_name?.includes('mp4')).toBe(true)
            expect(Number(mixedProbe.format.duration)).toBeGreaterThan(0)
            expect(Number(mixedProbe.format.duration)).toBeLessThanOrEqual(60)

            const result = await runHighlightDryRun(
              [{ path: imagePath, type: 'image' }],
              dryRunOutputPath
            )
            expect(result.commands.length).toBe(2)
            expect(await fileExists(dryRunOutputPath)).toBe(false)
          } finally {
            processingConfig.secondsPerImage = originalSecondsPerImage
          }
        })
      } finally {
        await rm(workDir, { recursive: true, force: true })
      }
    },
    60000
  )
})
