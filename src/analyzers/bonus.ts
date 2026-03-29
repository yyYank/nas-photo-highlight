import { clamp } from '../core/normalize.js'
import type { FaceDetection } from '../types/score.js'

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function calculateStabilityScore(currentFaces: FaceDetection[], previousFaces: FaceDetection[]) {
  if (currentFaces.length === 0 || previousFaces.length === 0) return 0

  const currentMaxSize = Math.max(...currentFaces.map((face) => face.faceSize))
  const previousMaxSize = Math.max(...previousFaces.map((face) => face.faceSize))
  const sizeDelta = Math.abs(currentMaxSize - previousMaxSize)
  return clamp(1 - sizeDelta / 0.3, 0, 1)
}

export function calculateBonusScore({
  audioPeak = 0,
  currentFaces,
  previousFaces = [],
}: {
  audioPeak?: number
  currentFaces: FaceDetection[]
  previousFaces?: FaceDetection[]
}) {
  if (currentFaces.length === 0) {
    return clamp(audioPeak * 0.2, 0, 1)
  }

  const faceSizeScore = average(currentFaces.map((face) => clamp(face.faceSize / 0.35, 0, 1)))
  const faceCenterScore = average(currentFaces.map((face) => clamp(1 - face.centerOffset, 0, 1)))
  const faceFrontalScore = average(currentFaces.map((face) => clamp(face.frontalScore, 0, 1)))
  const stabilityScore = calculateStabilityScore(currentFaces, previousFaces)

  return clamp(
    (faceSizeScore * 0.35) +
    (faceCenterScore * 0.25) +
    (faceFrontalScore * 0.20) +
    ((audioPeak > 0 ? audioPeak : stabilityScore) * 0.20),
    0,
    1
  )
}
