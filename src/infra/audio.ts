import { execFile } from 'child_process'
import { promisify } from 'util'
import type { AudioPeakSample } from '../types/media'

const execFileAsync = promisify(execFile)

export function buildAudioPeakExtractionArgs(inputPath: string) {
  return [
    '-hide_banner',
    '-i',
    inputPath,
    '-vn',
    '-af',
    'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
    '-f',
    'null',
    '-',
  ]
}

export function parseAudioPeakLines(stderr: string): AudioPeakSample[] {
  const samples: AudioPeakSample[] = []
  let currentTime = 0

  for (const line of stderr.split('\n')) {
    const ptsMatch = line.match(/pts_time:([0-9.]+)/)
    if (ptsMatch) {
      currentTime = Number(ptsMatch[1])
      continue
    }

    const rmsMatch = line.match(/lavfi\.astats\.Overall\.RMS_level=([-0-9.]+)/)
    if (rmsMatch) {
      const rms = Number(rmsMatch[1])
      const normalized = Number.isFinite(rms)
        ? Math.max(0, Math.min(1, (rms + 60) / 60))
        : 0
      samples.push({ time: currentTime, value: normalized })
    }
  }

  return samples
}

export async function extractAudioPeaks(inputPath: string): Promise<AudioPeakSample[]> {
  const args = buildAudioPeakExtractionArgs(inputPath)
  const { stderr } = await execFileAsync('ffmpeg', args)
  return parseAudioPeakLines(stderr)
}

export function alignAudioPeaksToFrames(
  frameTimes: number[],
  peaks: AudioPeakSample[]
) {
  return frameTimes.map((time) => {
    const nearest = peaks.reduce<AudioPeakSample | null>((best, peak) => {
      if (!best) return peak
      return Math.abs(peak.time - time) < Math.abs(best.time - time) ? peak : best
    }, null)

    return nearest?.value ?? 0
  })
}
