import { calculateFrameDiff, combineChangeScore } from '../analyzers/change'
import { calculateBonusScore } from '../analyzers/bonus'
import { calculateExpressionScore } from '../analyzers/expression'
import { calculateLaplacianVariance } from '../analyzers/focus'
import { normalizeByPercentile } from './normalize'
import type { SampledFrame } from '../types/media'
import type { FaceDetection, FrameScore } from '../types/score'

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

export async function scoreVideoFrames(
  frames: SampledFrame[],
  {
    audioPeaks,
    faceDetections,
  }: {
    audioPeaks?: number[]
    faceDetections?: FaceDetection[][]
  } = {}
): Promise<FrameScore[]> {
  if (frames.length === 0) return []

  const laplacianValues = await Promise.all(frames.map((frame) => calculateLaplacianVariance(frame.path)))
  const focusScores = normalizeByPercentile(laplacianValues)

  const frameDiffValues = await Promise.all(frames.map(async (frame, index) => {
    if (index === 0) return 0
    return calculateFrameDiff(frames[index - 1].path, frame.path)
  }))
  const normalizedFrameDiffs = normalizeByPercentile(frameDiffValues)
  const normalizedSceneChanges = normalizeByPercentile(frames.map((frame) => frame.sceneChange))
  const resolvedFaceDetections = faceDetections ?? frames.map(() => [])
  const expressionScores = resolvedFaceDetections.map((faces) => calculateExpressionScore(faces))
  const expressionDeltas = expressionScores.map((score, index) => index === 0 ? 0 : Math.abs(score - expressionScores[index - 1]!))
  const normalizedExpressionDeltas = normalizeByPercentile(expressionDeltas)

  return frames.map((frame, index) => {
    const expression = expressionScores[index] ?? 0
    const change = combineChangeScore({
      frameDiff: normalizedFrameDiffs[index] ?? 0,
      sceneChange: normalizedSceneChanges[index] ?? 0,
      expressionDelta: normalizedExpressionDeltas[index] ?? 0,
    })
    const focus = focusScores[index] ?? 0
    const bonus = calculateBonusScore({
      audioPeak: audioPeaks?.[index] ?? 0,
      currentFaces: resolvedFaceDetections[index] ?? [],
      previousFaces: index > 0 ? (resolvedFaceDetections[index - 1] ?? []) : [],
    })

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
        faceCount: resolvedFaceDetections[index]?.length ?? 0,
        primaryFaceSize: resolvedFaceDetections[index]?.[0]?.faceSize ?? 0,
      },
    }
  })
}
