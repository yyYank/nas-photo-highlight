import { describe, expect, it } from 'bun:test'
import {
  rankCandidateSummaries,
  summarizeCandidate,
} from '../src/core/evaluate'

describe('summarizeCandidate', () => {
  it('候補 JSON から比較用サマリを作る', () => {
    const summary = summarizeCandidate(
      {
        mediaId: 'a.mp4',
        segments: [
          {
            start: 0,
            end: 1,
            peakTime: 0.5,
            score: 0.8,
            reason: { expression: 0.8, change: 0.7, focus: 0.6, bonus: 0.4 },
          },
          {
            start: 2,
            end: 3,
            peakTime: 2.5,
            score: 0.6,
            reason: { expression: 0.4, change: 0.7, focus: 0.5, bonus: 0.2 },
          },
        ],
      },
      'config-a'
    )

    expect(summary).toEqual({
      averageScore: 0.7,
      config: 'config-a',
      segmentCount: 2,
      topScore: 0.8,
    })
  })
})

describe('rankCandidateSummaries', () => {
  it('平均スコア優先で比較結果を並べる', () => {
    const ranked = rankCandidateSummaries([
      { averageScore: 0.5, config: 'b', segmentCount: 3, topScore: 0.7 },
      { averageScore: 0.7, config: 'a', segmentCount: 2, topScore: 0.8 },
    ])

    expect(ranked.map((item) => item.config)).toEqual(['a', 'b'])
  })
})
