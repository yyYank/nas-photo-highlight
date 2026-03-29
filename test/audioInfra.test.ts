import { describe, expect, it } from 'bun:test'
import {
  alignAudioPeaksToFrames,
  buildAudioPeakExtractionArgs,
  parseAudioPeakLines,
} from '../src/infra/audio'

describe('buildAudioPeakExtractionArgs', () => {
  it('audio peak 抽出用の ffmpeg 引数を組み立てる', () => {
    expect(buildAudioPeakExtractionArgs('/tmp/input.mp4')).toEqual([
      '-hide_banner',
      '-i',
      '/tmp/input.mp4',
      '-vn',
      '-af',
      'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
      '-f',
      'null',
      '-',
    ])
  })
})

describe('parseAudioPeakLines', () => {
  it('ffmpeg astats 出力から時刻付きピークを読む', () => {
    const parsed = parseAudioPeakLines(
      [
        '[Parsed_ametadata_1 @ 0x0] frame:0 pts:0 pts_time:0',
        '[Parsed_ametadata_1 @ 0x0] lavfi.astats.Overall.RMS_level=-30.0',
        '[Parsed_ametadata_1 @ 0x0] frame:1 pts:1024 pts_time:1.0',
        '[Parsed_ametadata_1 @ 0x0] lavfi.astats.Overall.RMS_level=-12.0',
      ].join('\n')
    )

    expect(parsed).toEqual([
      { time: 0, value: 0.5 },
      { time: 1, value: 0.8 },
    ])
  })
})

describe('alignAudioPeaksToFrames', () => {
  it('各フレーム時刻へ最も近い音声ピークを割り当てる', () => {
    expect(
      alignAudioPeaksToFrames(
        [0.1, 0.9],
        [
          { time: 0, value: 0.3 },
          { time: 1, value: 0.7 },
        ]
      )
    ).toEqual([0.3, 0.7])
  })
})
