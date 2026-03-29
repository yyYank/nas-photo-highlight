import { describe, expect, it } from 'bun:test'
import { resolveFaceDetectionsForFrames } from '../src/infra/mediapipe'

describe('resolveFaceDetectionsForFrames', () => {
  it('フレームパスに対応する顔解析結果を引き当てる', () => {
    const result = resolveFaceDetectionsForFrames(
      [
        { path: '/tmp/a.jpg', time: 0, sceneChange: 0 },
        { path: '/tmp/b.jpg', time: 1, sceneChange: 0.3 },
      ],
      {
        '/tmp/b.jpg': [
          {
            smile: 0.7,
            surprise: 0.2,
            eyeOpen: 0.9,
            mouthOpen: 0.1,
            faceSize: 0.25,
            centerOffset: 0.1,
            frontalScore: 0.9,
            detectionConfidence: 0.95,
          },
        ],
      }
    )

    expect(result[0]).toEqual([])
    expect(result[1]?.[0]?.smile).toBe(0.7)
  })
})
