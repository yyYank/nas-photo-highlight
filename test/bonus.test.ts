import { describe, expect, it } from 'bun:test'
import { calculateBonusScore } from '../src/analyzers/bonus'

describe('calculateBonusScore', () => {
  it('顔サイズと中央寄り配置と正面度から補正点を作る', () => {
    const score = calculateBonusScore({
      currentFaces: [{
        smile: 0,
        surprise: 0,
        eyeOpen: 0,
        mouthOpen: 0,
        faceSize: 0.3,
        centerOffset: 0.1,
        frontalScore: 0.9,
        detectionConfidence: 0.9,
      }],
    })

    expect(score).toBeGreaterThan(0.6)
  })

  it('audio peak がある場合は bonus に反映する', () => {
    const score = calculateBonusScore({
      audioPeak: 1,
      currentFaces: [],
    })

    expect(score).toBeCloseTo(0.2, 5)
  })
})
