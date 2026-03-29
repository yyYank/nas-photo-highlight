import { calculateFrameDiff, combineChangeScore } from '../analyzers/change.js'
import { calculateLaplacianVariance } from '../analyzers/focus.js'
import { normalizeByPercentile } from './normalize.js'
import type { SampledFrame } from '../types/media.js'
import type { FrameScore } from '../types/score.js'

export function calculateTotalScore({
  expression,
  change,
  focus,
  bonus,
}: {
  expression: number
  change: number
  focus: number
  bonus: number
}) {
  return (expression * 0.35) + (change * 0.30) + (focus * 0.25) + (bonus * 0.10)
}

export async function scoreVideoFrames(frames: SampledFrame[]): Promise<FrameScore[]> {
  if (frames.length === 0) return []

  const laplacianValues = await Promise.all(frames.map((frame) => calculateLaplacianVariance(frame.path)))
  const focusScores = normalizeByPercentile(laplacianValues)

  const frameDiffValues = await Promise.all(frames.map(async (frame, index) => {
    if (index === 0) return 0
    return calculateFrameDiff(frames[index - 1].path, frame.path)
  }))
  const normalizedFrameDiffs = normalizeByPercentile(frameDiffValues)
  const normalizedSceneChanges = normalizeByPercentile(frames.map((frame) => frame.sceneChange))

  return frames.map((frame, index) => {
    const expression = 0
    const bonus = 0
    const change = combineChangeScore({
      frameDiff: normalizedFrameDiffs[index] ?? 0,
      sceneChange: normalizedSceneChanges[index] ?? 0,
      expressionDelta: 0,
    })
    const focus = focusScores[index] ?? 0

    return {
      path: frame.path,
      time: frame.time,
      expression,
      change,
      focus,
      bonus,
      total: calculateTotalScore({ expression, change, focus, bonus }),
      meta: {
        frameDiff: frameDiffValues[index] ?? 0,
        laplacianVar: laplacianValues[index] ?? 0,
        sceneChange: frame.sceneChange,
      },
    }
  })
}
