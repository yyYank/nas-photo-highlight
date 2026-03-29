export interface FrameScoreMeta {
  frameDiff: number
  laplacianVar: number
  sceneChange: number
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
