import { clamp } from '../core/normalize.js'
import type { FaceDetection } from '../types/score.js'

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function weightFaces(faces: FaceDetection[]) {
  if (faces.length === 0) return []

  const rawWeights = faces.map((face) => Math.max(0.01, (face.faceSize * 0.7) + (face.detectionConfidence * 0.3)))
  const weightTotal = rawWeights.reduce((sum, value) => sum + value, 0)
  return rawWeights.map((weight) => weight / weightTotal)
}

function selectPrimaryFaces(faces: FaceDetection[], limit = 2) {
  return [...faces]
    .sort((a, b) => b.faceSize - a.faceSize)
    .slice(0, limit)
}

export function calculateExpressionScore(faces: FaceDetection[]): number {
  if (faces.length === 0) return 0

  const primaryFaces = selectPrimaryFaces(faces)
  const weights = weightFaces(primaryFaces)
  const raw = primaryFaces.reduce((sum, face, index) => sum + ((
    (face.smile * 0.45) +
    (face.surprise * 0.20) +
    (face.eyeOpen * 0.20) +
    (face.mouthOpen * 0.15)
  ) * (weights[index] ?? 0)), 0)

  const penalty = primaryFaces.reduce((sum, face, index) => sum + ((
    Math.max(0, 0.18 - face.faceSize) * 1.2 +
    Math.max(0, face.centerOffset - 0.35) * 0.7 +
    Math.max(0, 0.55 - face.frontalScore) * 0.8 +
    Math.max(0, 0.65 - face.detectionConfidence) * 0.6
  ) * (weights[index] ?? 0)), 0)

  return clamp(raw - penalty, 0, 1)
}
