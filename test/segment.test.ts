import { describe, expect, it } from 'bun:test'
import {
  buildSegmentsFromPeaks,
  detectPeakFrames,
  mergeNearbyPeaks,
  scoreSegment,
  smoothFrameScores,
} from '../src/core/segment'
import type { FrameScore } from '../src/types/score'

function frame(time: number, total: number): FrameScore {
  return {
    path: `/tmp/${time}.jpg`,
    time,
    expression: total * 0.2,
    change: total * 0.3,
    focus: total * 0.4,
    bonus: total * 0.1,
    total,
    meta: {
      frameDiff: 0,
      laplacianVar: 0,
      sceneChange: 0,
      faceCount: 1,
      primaryFaceSize: 0.2,
    },
  }
}

describe('smoothFrameScores', () => {
  it('近傍平均との差で total を平滑化する', () => {
    const smoothed = smoothFrameScores(
      [frame(0, 0), frame(1, 1), frame(2, 0)],
      1
    )
    expect(smoothed[1]?.total).toBeCloseTo(1 / 3, 5)
  })
})

describe('detectPeakFrames', () => {
  it('threshold を超える局所ピークを拾う', () => {
    const peaks = detectPeakFrames(
      [frame(0, 0.1), frame(1, 0.8), frame(2, 0.2)],
      0.5
    )
    expect(peaks.map((peak) => peak.time)).toEqual([1])
  })
})

describe('mergeNearbyPeaks', () => {
  it('近いピークは高い方へマージする', () => {
    const peaks = mergeNearbyPeaks(
      [frame(1, 0.7), frame(2, 0.9), frame(8, 0.6)],
      3
    )
    expect(peaks.map((peak) => peak.time)).toEqual([2, 8])
  })
})

describe('scoreSegment', () => {
  it('最大値と上位平均の合成で区間スコアを返す', () => {
    expect(
      scoreSegment([frame(0, 0.2), frame(1, 0.6), frame(2, 0.8)])
    ).toBeCloseTo(0.6933333333, 5)
  })
})

describe('buildSegmentsFromPeaks', () => {
  it('ピーク前後に余白を付けて区間化する', () => {
    const frames = [frame(0, 0.1), frame(1, 0.9), frame(2, 0.4), frame(3, 0.2)]
    const segments = buildSegmentsFromPeaks(frames, [frames[1]!])

    expect(segments[0]).toMatchObject({
      start: 0,
      end: 2.5,
      peakTime: 1,
    })
    expect(segments[0]?.frames).toHaveLength(3)
  })
})
