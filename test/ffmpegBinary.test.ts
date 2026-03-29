import { describe, expect, it } from 'bun:test'
import { buildMissingBinaryError } from '../src/infra/ffmpegBinary'

describe('buildMissingBinaryError', () => {
  it('ffmpeg 未導入時の案内メッセージを返す', () => {
    expect(buildMissingBinaryError('ffmpeg').message).toBe(
      'ffmpeg command is not available. Install ffmpeg and ensure ffmpeg is on PATH.'
    )
  })
})
