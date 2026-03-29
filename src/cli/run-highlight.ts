import { mkdtempSync } from 'fs'
import os from 'os'
import path from 'path'
import { rm } from 'fs/promises'
import { extractVideoFrames } from '../infra/ffmpeg.js'
import { loadFaceDetectionsFromFile, resolveFaceDetectionsForFrames } from '../infra/mediapipe.js'
import { scoreVideoFrames } from '../core/scoring.js'
import { buildSegmentsFromPeaks, detectPeakFrames, mergeNearbyPeaks, smoothFrameScores } from '../core/segment.js'
import type { HighlightCandidate } from '../types/score.js'

const args = process.argv.slice(2)
const mediaPath = args[0]
const fpsIndex = args.indexOf('--fps')
const fps = fpsIndex >= 0 ? Number(args[fpsIndex + 1]) : 4
const faceAnalysisIndex = args.indexOf('--face-analysis')
const faceAnalysisPath = faceAnalysisIndex >= 0 ? args[faceAnalysisIndex + 1] : undefined

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
  const faceDetections = faceAnalysisPath
    ? resolveFaceDetectionsForFrames(frames, await loadFaceDetectionsFromFile(faceAnalysisPath))
    : undefined
  const scores = await scoreVideoFrames(frames, { faceDetections })
  const smoothed = smoothFrameScores(scores)
  const peaks = mergeNearbyPeaks(detectPeakFrames(smoothed))
  const segments = buildSegmentsFromPeaks(smoothed, peaks)

  const candidate: HighlightCandidate = {
    mediaId: path.basename(mediaPath),
    segments: segments.map((segment) => {
      const peakFrame = segment.frames.reduce((best, frame) => frame.total > best.total ? frame : best, segment.frames[0]!)
      return {
        start: segment.start,
        end: segment.end,
        peakTime: segment.peakTime,
        score: segment.score,
        reason: {
          expression: peakFrame.expression,
          change: peakFrame.change,
          focus: peakFrame.focus,
          bonus: peakFrame.bonus,
        },
      }
    }),
  }

  console.log(JSON.stringify({
    candidate,
    faceAnalysisPath,
    fps,
    frameCount: scores.length,
    mediaPath,
    scores,
  }, null, 2))
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
