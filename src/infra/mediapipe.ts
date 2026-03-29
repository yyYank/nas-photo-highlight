import { readFile } from 'fs/promises'
import type { SampledFrame } from '../types/media.js'
import type { FaceDetection } from '../types/score.js'

export type FaceDetectionMap = Record<string, FaceDetection[]>

export async function loadFaceDetectionsFromFile(filePath: string): Promise<FaceDetectionMap> {
  const text = await readFile(filePath, 'utf8')
  return JSON.parse(text) as FaceDetectionMap
}

export function resolveFaceDetectionsForFrames(
  frames: SampledFrame[],
  detections: FaceDetectionMap
) {
  return frames.map((frame) => detections[frame.path] ?? [])
}
