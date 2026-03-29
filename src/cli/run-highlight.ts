import { mkdtempSync } from 'fs'
import os from 'os'
import path from 'path'
import { rm } from 'fs/promises'
import { extractVideoFrames } from '../infra/ffmpeg.js'
import { scoreVideoFrames } from '../core/scoring.js'

const args = process.argv.slice(2)
const mediaPath = args[0]
const fpsIndex = args.indexOf('--fps')
const fps = fpsIndex >= 0 ? Number(args[fpsIndex + 1]) : 4

if (!mediaPath) {
  throw new Error('Usage: bun src/cli/run-highlight.ts /path/to/video.mp4 [--fps 4]')
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'nas-photo-highlight-score-'))

try {
  const frames = await extractVideoFrames({
    fps,
    inputPath: mediaPath,
    outputDir: tempDir,
  })
  const scores = await scoreVideoFrames(frames)

  console.log(JSON.stringify({
    fps,
    frameCount: scores.length,
    mediaPath,
    scores,
  }, null, 2))
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
