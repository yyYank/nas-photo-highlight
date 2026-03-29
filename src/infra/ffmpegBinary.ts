function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test'
}

export function resolveFfmpegBin(): string {
  if (isTestMode() && process.env.FFMPEG_BIN) {
    return process.env.FFMPEG_BIN
  }

  return 'ffmpeg'
}

export function resolveFfprobeBin(): string {
  if (isTestMode() && process.env.FFPROBE_BIN) {
    return process.env.FFPROBE_BIN
  }

  return 'ffprobe'
}
