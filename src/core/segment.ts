import type { FrameScore } from '../types/score.js'

export interface SegmentScore {
  start: number
  end: number
  peakTime: number
  score: number
  frames: FrameScore[]
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function smoothFrameScores(
  frames: FrameScore[],
  windowRadius: number = 2
): FrameScore[] {
  return frames.map((frame, index) => {
    const start = Math.max(0, index - windowRadius)
    const end = Math.min(frames.length, index + windowRadius + 1)
    const window = frames.slice(start, end)
    const averageTotal = average(window.map((item) => item.total))

    return {
      ...frame,
      total: averageTotal,
    }
  })
}

export function detectPeakFrames(
  frames: FrameScore[],
  threshold: number = 0.55
): FrameScore[] {
  return frames.filter((frame, index) => {
    if (frame.total < threshold) return false
    const previous = frames[index - 1]
    const next = frames[index + 1]
    return frame.total >= (previous?.total ?? 0) && frame.total >= (next?.total ?? 0)
  })
}

export function mergeNearbyPeaks(
  peaks: FrameScore[],
  mergeWithinSeconds: number = 3
): FrameScore[] {
  if (peaks.length === 0) return []

  const merged: FrameScore[] = [peaks[0]]
  for (const peak of peaks.slice(1)) {
    const last = merged[merged.length - 1]!
    if ((peak.time - last.time) <= mergeWithinSeconds) {
      if (peak.total > last.total) {
        merged[merged.length - 1] = peak
      }
      continue
    }
    merged.push(peak)
  }

  return merged
}

export function scoreSegment(frames: FrameScore[]): number {
  if (frames.length === 0) return 0

  const sortedTotals = [...frames.map((frame) => frame.total)].sort((a, b) => b - a)
  const topCount = Math.min(3, sortedTotals.length)
  const topAverage = average(sortedTotals.slice(0, topCount))
  return (Math.max(...sortedTotals) * 0.6) + (topAverage * 0.4)
}

export function buildSegmentsFromPeaks(
  frames: FrameScore[],
  peaks: FrameScore[],
  {
    leadSeconds = 1.5,
    lagSeconds = 1.5,
  }: {
    leadSeconds?: number
    lagSeconds?: number
  } = {}
): SegmentScore[] {
  return peaks.map((peak) => {
    const start = Math.max(0, peak.time - leadSeconds)
    const end = peak.time + lagSeconds
    const segmentFrames = frames.filter((frame) => frame.time >= start && frame.time <= end)

    return {
      start,
      end,
      peakTime: peak.time,
      score: scoreSegment(segmentFrames),
      frames: segmentFrames,
    }
  })
}
