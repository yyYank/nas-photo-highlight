import { describe, expect, it } from 'bun:test'
import { calculateExpressionScore, weightFaces } from '../src/analyzers/expression.js'

describe('calculateExpressionScore', () => {
  it('表情が強く顔品質が高いほど高得点になる', () => {
    const score = calculateExpressionScore([
      {
        smile: 0.9,
        surprise: 0.2,
        eyeOpen: 0.9,
        mouthOpen: 0.3,
        faceSize: 0.28,
        centerOffset: 0.1,
        frontalScore: 0.95,
        detectionConfidence: 0.95,
      },
    ])

    expect(score).toBeGreaterThan(0.6)
  })

  it('顔が小さく斜めで不安定なら減点される', () => {
    const score = calculateExpressionScore([
      {
        smile: 0.9,
        surprise: 0.2,
        eyeOpen: 0.9,
        mouthOpen: 0.3,
        faceSize: 0.08,
        centerOffset: 0.6,
        frontalScore: 0.2,
        detectionConfidence: 0.4,
      },
    ])

    expect(score).toBeLessThan(0.3)
  })
})

describe('weightFaces', () => {
  it('顔サイズと検出信頼度で重み付けする', () => {
    const weights = weightFaces([
      {
        smile: 0,
        surprise: 0,
        eyeOpen: 0,
        mouthOpen: 0,
        faceSize: 0.3,
        centerOffset: 0,
        frontalScore: 1,
        detectionConfidence: 1,
      },
      {
        smile: 0,
        surprise: 0,
        eyeOpen: 0,
        mouthOpen: 0,
        faceSize: 0.1,
        centerOffset: 0,
        frontalScore: 1,
        detectionConfidence: 0.5,
      },
    ])

    expect(weights[0]).toBeGreaterThan(weights[1] ?? 0)
    expect(weights[0]! + weights[1]!).toBeCloseTo(1, 5)
  })
})
