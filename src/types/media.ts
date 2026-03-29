export interface SampledFrame {
  path: string
  time: number
  sceneChange: number
}

export interface ExtractVideoFramesOptions {
  fps: number
  inputPath: string
  outputDir: string
}

export interface AudioPeakSample {
  time: number
  value: number
}
