import { execFile } from 'child_process'
import { promisify } from 'util'
import { readdir } from 'fs/promises'
import path from 'path'
import type { ExtractVideoFramesOptions, SampledFrame } from '../types/media'

const execFileAsync = promisify(execFile)

export function buildFrameExtractionArgs({
  fps,
  inputPath,
  outputDir,
}: ExtractVideoFramesOptions) {
  return [
    '-hide_banner',
    '-loglevel',
    'info',
    '-i',
    inputPath,
    '-vf',
    `fps=${fps},scale=640:-1:force_original_aspect_ratio=decrease,showinfo`,
    '-vsync',
    'vfr',
    path.join(outputDir, 'frame-%06d.jpg'),
  ]
}

export function parseShowinfoLine(line: string) {
  const ptsTimeMatch = line.match(/pts_time:([0-9.]+)/)
  if (!ptsTimeMatch) return null

  const sceneScoreMatch = line.match(/scene_score[:=]([0-9.]+)/)
  return {
    sceneChange: sceneScoreMatch ? Number(sceneScoreMatch[1]) : 0,
    time: Number(ptsTimeMatch[1]),
  }
}

export async function extractVideoFrames(
  options: ExtractVideoFramesOptions
): Promise<SampledFrame[]> {
  const args = buildFrameExtractionArgs(options)
  const { stderr } = await execFileAsync('ffmpeg', args)
  const frameMetadata = stderr
    .split('\n')
    .map(parseShowinfoLine)
    .filter(
      (line): line is { sceneChange: number; time: number } => line !== null
    )

  const frameFiles = (await readdir(options.outputDir))
    .filter((file) => file.endsWith('.jpg'))
    .sort((a, b) => a.localeCompare(b))

  return frameFiles.map((file, index) => ({
    path: path.join(options.outputDir, file),
    sceneChange: frameMetadata[index]?.sceneChange ?? 0,
    time: frameMetadata[index]?.time ?? index / options.fps,
  }))
}
