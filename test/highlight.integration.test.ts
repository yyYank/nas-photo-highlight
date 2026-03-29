import { describe, expect, it } from 'bun:test'
import { execFile } from 'child_process'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import sharp from 'sharp'
import { config } from '../src/config'
import type { HighlightCandidate } from '../src/types/score'
import {
  generateHighlight,
  runHighlightDryRun,
  type HighlightSegment,
} from '../src/generator/highlight'
import { runPipeline } from '../src/pipeline'

const execFileAsync = promisify(execFile)
const DOCKER_FFMPEG_IMAGE = 'jrottenberg/ffmpeg:6.1-alpine'
const hasLocalFfmpeg = Boolean(Bun.which('ffmpeg') && Bun.which('ffprobe'))
const hasDocker = Boolean(Bun.which('docker'))
const canRunIntegration = hasLocalFfmpeg || hasDocker
const integrationIt = canRunIntegration ? it : it.skip

interface MediaEnvironment {
  ffmpegBin: string
  ffprobeBin: string
  restore(): Promise<void>
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function createMediaEnvironment(
  workDir: string
): Promise<MediaEnvironment> {
  const prevFfmpeg = process.env.FFMPEG_BIN
  const prevFfprobe = process.env.FFPROBE_BIN
  const prevNodeEnv = process.env.NODE_ENV
  const prevTmpDir = process.env.TMPDIR

  let ffmpegBin = 'ffmpeg'
  let ffprobeBin = 'ffprobe'
  let containerName: string | null = null

  if (!hasLocalFfmpeg) {
    containerName = `nas-photo-highlight-ffmpeg-test-${Date.now()}`
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

    ffmpegBin = ffmpegWrapper
    ffprobeBin = ffprobeWrapper
    process.env.FFMPEG_BIN = ffmpegWrapper
    process.env.FFPROBE_BIN = ffprobeWrapper
  }

  process.env.NODE_ENV = 'test'
  process.env.TMPDIR = workDir

  return {
    ffmpegBin,
    ffprobeBin,
    async restore() {
      if (containerName) {
        await execFileAsync('docker', ['rm', '-f', containerName]).catch(
          () => undefined
        )
      }
      process.env.FFMPEG_BIN = prevFfmpeg
      process.env.FFPROBE_BIN = prevFfprobe
      process.env.NODE_ENV = prevNodeEnv
      process.env.TMPDIR = prevTmpDir
    },
  }
}

async function createImage(
  outputPath: string,
  background: { r: number; g: number; b: number }
): Promise<void> {
  await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background,
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

async function createBgmTrack(
  ffmpegBin: string,
  outputPath: string
): Promise<void> {
  await runMediaTool(ffmpegBin, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '2',
    '-c:a',
    'libmp3lame',
    outputPath,
  ])
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

async function runBunScript(args: string[], env: NodeJS.ProcessEnv) {
  return execFileAsync(process.execPath, args, {
    cwd: process.cwd(),
    env,
    maxBuffer: 1024 * 1024 * 50,
  })
}

describe('highlight integration', () => {
  integrationIt(
    '過去の PR で入った generator / CLI / pipeline の主要経路を通す',
    async () => {
      const workDir = await mkdtemp(
        path.join(process.cwd(), '.tmp-highlight-integration-')
      )
      const mediaEnv = await createMediaEnvironment(workDir)

      const processingConfig = config.processing as {
        groupBy: 'date' | 'folder'
        imagesPerHighlight: number
        minImagesToGenerate: number
        secondsPerImage: number
      }
      const nasConfig = config.nas as {
        metaOutputPath: string
        outputPath: string
        photoPath: string
      }
      const mutableConfig = config as { bgmPath: string }
      const originalConfig = {
        bgmPath: config.bgmPath,
        groupBy: config.processing.groupBy,
        imagesPerHighlight: config.processing.imagesPerHighlight,
        metaOutputPath: config.nas.metaOutputPath,
        minImagesToGenerate: config.processing.minImagesToGenerate,
        outputPath: config.nas.outputPath,
        photoPath: config.nas.photoPath,
        secondsPerImage: config.processing.secondsPerImage,
      }

      try {
        const imageAPath = path.join(workDir, 'image-a.png')
        const imageBPath = path.join(workDir, 'image-b.png')
        const audioVideoPath = path.join(workDir, 'sample-audio.mp4')
        const silentVideoPath = path.join(workDir, 'sample-silent.mp4')
        const bgmPath = path.join(workDir, 'bgm.mp3')
        const faceAnalysisPath = path.join(workDir, 'faces.json')
        const evaluateAPath = path.join(workDir, 'candidate-a.json')
        const evaluateBPath = path.join(workDir, 'candidate-b.json')
        const inputListPath = path.join(workDir, 'input-list.txt')
        const outputDir = path.join(workDir, 'out')
        const metaDir = path.join(workDir, 'meta')

        processingConfig.secondsPerImage = 1
        processingConfig.imagesPerHighlight = 2
        processingConfig.minImagesToGenerate = 1
        processingConfig.groupBy = 'folder'
        nasConfig.photoPath = workDir
        nasConfig.outputPath = outputDir
        nasConfig.metaOutputPath = metaDir
        mutableConfig.bgmPath = ''

        await mkdir(outputDir, { recursive: true })
        await mkdir(metaDir, { recursive: true })

        await createImage(imageAPath, { r: 220, g: 120, b: 40 })
        await createImage(imageBPath, { r: 40, g: 160, b: 220 })
        await createSampleVideo(mediaEnv.ffmpegBin, audioVideoPath, true)
        await createSampleVideo(mediaEnv.ffmpegBin, silentVideoPath, false)
        await createBgmTrack(mediaEnv.ffmpegBin, bgmPath)
        await writeFile(faceAnalysisPath, '{}', 'utf8')

        const mixedOutputPath = path.join(workDir, 'highlight-mixed.mp4')
        const silentOutputPath = path.join(workDir, 'highlight-silent.mp4')
        const bgmOutputPath = path.join(workDir, 'highlight-bgm.mp4')
        const dryRunOutputPath = path.join(workDir, 'dry-run-output.mp4')
        const mixedSegments: HighlightSegment[] = [
          { path: imageAPath, type: 'image' },
          { path: audioVideoPath, type: 'video' },
        ]

        await generateHighlight(mixedSegments, mixedOutputPath)
        expect(await fileExists(mixedOutputPath)).toBe(true)
        expect((await stat(mixedOutputPath)).size).toBeGreaterThan(0)

        const mixedProbe = await probeMedia(
          mediaEnv.ffprobeBin,
          mixedOutputPath
        )
        expect(
          mixedProbe.streams.some((stream) => stream.codec_type === 'video')
        ).toBe(true)
        expect(
          mixedProbe.streams.some((stream) => stream.codec_type === 'audio')
        ).toBe(true)
        expect(mixedProbe.format.format_name?.includes('mp4')).toBe(true)
        expect(Number(mixedProbe.format.duration)).toBeGreaterThan(0)
        expect(Number(mixedProbe.format.duration)).toBeLessThanOrEqual(60)

        await generateHighlight(
          [{ path: silentVideoPath, type: 'video' }],
          silentOutputPath
        )
        const silentProbe = await probeMedia(
          mediaEnv.ffprobeBin,
          silentOutputPath
        )
        expect(
          silentProbe.streams.some((stream) => stream.codec_type === 'video')
        ).toBe(true)
        expect(
          silentProbe.streams.some((stream) => stream.codec_type === 'audio')
        ).toBe(true)

        mutableConfig.bgmPath = bgmPath
        await generateHighlight(mixedSegments, bgmOutputPath)
        const bgmProbe = await probeMedia(mediaEnv.ffprobeBin, bgmOutputPath)
        expect(
          bgmProbe.streams.some((stream) => stream.codec_type === 'audio')
        ).toBe(true)
        expect(Number(bgmProbe.format.duration)).toBeGreaterThan(0)

        const dryRunResult = await runHighlightDryRun(
          mixedSegments,
          dryRunOutputPath
        )
        expect(dryRunResult.commands.length).toBe(3)
        expect(await fileExists(dryRunOutputPath)).toBe(false)
        expect(
          dryRunResult.commands.some((command) =>
            command.command.includes('amix=inputs=2:duration=first')
          )
        ).toBe(true)

        const commonEnv = {
          ...process.env,
          FFMPEG_BIN: mediaEnv.ffmpegBin,
          FFPROBE_BIN: mediaEnv.ffprobeBin,
          NODE_ENV: 'test',
          TMPDIR: workDir,
        }

        const cliHighlight = await runBunScript(
          [
            'src/cli/run-highlight.ts',
            audioVideoPath,
            '--fps',
            '2',
            '--face-analysis',
            faceAnalysisPath,
            '--with-audio-peaks',
          ],
          commonEnv
        )
        const highlightJson = JSON.parse(cliHighlight.stdout) as {
          candidate: HighlightCandidate
          fps: number
          frameCount: number
          mediaPath: string
          scores: Array<{ time: number; total: number }>
          withAudioPeaks: boolean
        }
        expect(highlightJson.mediaPath).toBe(audioVideoPath)
        expect(highlightJson.fps).toBe(2)
        expect(highlightJson.withAudioPeaks).toBe(true)
        expect(highlightJson.frameCount).toBeGreaterThan(0)
        expect(highlightJson.scores.length).toBe(highlightJson.frameCount)
        expect(Array.isArray(highlightJson.candidate.segments)).toBe(true)

        await writeFile(
          evaluateAPath,
          JSON.stringify(highlightJson.candidate, null, 2),
          'utf8'
        )
        await writeFile(
          evaluateBPath,
          JSON.stringify(
            {
              ...highlightJson.candidate,
              segments: highlightJson.candidate.segments.map((segment) => ({
                ...segment,
                score: segment.score * 0.5,
              })),
            },
            null,
            2
          ),
          'utf8'
        )

        const cliEvaluate = await runBunScript(
          [
            'src/cli/evaluate-highlight.ts',
            `baseline=${evaluateAPath}`,
            `tuned=${evaluateBPath}`,
          ],
          commonEnv
        )
        const ranked = JSON.parse(cliEvaluate.stdout) as Array<{
          averageScore: number
          config: string
        }>
        expect(ranked[0]?.config).toBe('baseline')
        expect(ranked[1]?.config).toBe('tuned')

        mutableConfig.bgmPath = ''
        await writeFile(
          inputListPath,
          [imageAPath, audioVideoPath, imageBPath].join('\n'),
          'utf8'
        )

        const pipelineSummary = await runPipeline({
          dryRun: true,
          force: true,
          inputListPath,
        })
        expect(pipelineSummary.generated).toBe(0)

        const generatedFiles = await readdir(outputDir)
        expect(generatedFiles.some((file) => file.endsWith('.mp4'))).toBe(false)
      } finally {
        mutableConfig.bgmPath = originalConfig.bgmPath
        processingConfig.groupBy = originalConfig.groupBy
        processingConfig.imagesPerHighlight = originalConfig.imagesPerHighlight
        processingConfig.minImagesToGenerate =
          originalConfig.minImagesToGenerate
        processingConfig.secondsPerImage = originalConfig.secondsPerImage
        nasConfig.metaOutputPath = originalConfig.metaOutputPath
        nasConfig.outputPath = originalConfig.outputPath
        nasConfig.photoPath = originalConfig.photoPath
        await mediaEnv.restore()
        await rm(workDir, { recursive: true, force: true })
      }
    },
    120000
  )
})
