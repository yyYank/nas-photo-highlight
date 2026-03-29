export interface FaceDetection {
  smile: number
  surprise: number
  eyeOpen: number
  mouthOpen: number
  faceSize: number
  centerOffset: number
  frontalScore: number
  detectionConfidence: number
}

export interface FrameScoreMeta {
  frameDiff: number
  laplacianVar: number
  sceneChange: number
  faceCount: number
  primaryFaceSize: number
}

export interface FrameScore {
  path: string
  time: number
  expression: number
  change: number
  focus: number
  bonus: number
  total: number
  meta: FrameScoreMeta
}
