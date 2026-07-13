import { describe, expect, it } from 'bun:test'
import {
  buildBgmMixFilter,
  buildVideoBgmVolumeRanges,
  buildFfmpegThreadArgs,
  buildConcatListContent,
  buildCachedSegmentSourcePath,
  buildFinalHighlightOutputOptions,
  buildImageSegmentFilters,
  buildImageSegmentOutputOptions,
  buildStagedOutputPath,
  buildSilentAudioInputArgs,
  buildVideoSegmentFilters,
  buildVideoSegmentOutputOptions,
  shouldThrottleAfterFfmpegRun,
} from '../src/generator/highlight'

describe('buildImageSegmentFilters', () => {
  it('静止画セグメントを再生可能な縦動画に正規化する', () => {
    expect(buildImageSegmentFilters(3)).toEqual([
      'scale=1080:1920:force_original_aspect_ratio=decrease',
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
      "zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.001))':d=90:s=1080x1920:fps=30",
      'setsar=1',
      'format=yuv420p',
    ])
  })
})

describe('buildVideoSegmentFilters', () => {
  it('動画セグメントの fps と timestamp を正規化する', () => {
    expect(buildVideoSegmentFilters()).toEqual([
      'scale=1080:1920:force_original_aspect_ratio=decrease',
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
      'fps=30',
      'setsar=1',
      'setpts=PTS-STARTPTS',
      'format=yuv420p',
    ])
  })
})

describe('buildImageSegmentOutputOptions', () => {
  it('静止画セグメントに無音トラックと秒数制限を付ける', () => {
    expect(buildImageSegmentOutputOptions(3)).toEqual([
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-shortest',
      '-t',
      '3',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-r',
      '30',
    ])
  })
})

describe('buildVideoSegmentOutputOptions', () => {
  it('元動画に音声があればそれを使う', () => {
    expect(buildVideoSegmentOutputOptions(true)).toEqual([
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-shortest',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-r',
      '30',
    ])
  })

  it('元動画に音声がなければ無音トラックを使う', () => {
    expect(buildVideoSegmentOutputOptions(false)).toEqual([
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-shortest',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-r',
      '30',
    ])
  })
})

describe('buildFinalHighlightOutputOptions', () => {
  it('最終動画を 60 秒で打ち切る', () => {
    expect(buildFinalHighlightOutputOptions()).toEqual([
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-t',
      '60',
      '-movflags',
      '+faststart',
    ])
  })
})

describe('buildSilentAudioInputArgs', () => {
  it('lavfi を ffmpeg 引数として明示する', () => {
    expect(buildSilentAudioInputArgs()).toEqual([
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000',
    ])
  })
})

describe('buildFfmpegThreadArgs', () => {
  it('ffmpeg を単スレッドで動かす', () => {
    expect(buildFfmpegThreadArgs()).toEqual(['-threads', '1'])
  })
})

describe('buildBgmMixFilter', () => {
  it('BGM を 30% 下げてから本編音声と mix する', () => {
    expect(
      buildBgmMixFilter(0.7, [
        { start: 3, end: 8.2 },
        { start: 12.5, end: 18 },
      ])
    ).toBe(
      "[1:a]volume=0.7[bgm0];[bgm0]volume=0.28:enable='between(t,3,8.2)+between(t,12.5,18)'[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]"
    )
  })
})

describe('buildBgmMixFilter の区間圧縮', () => {
  it('連続・重複する区間は1つの between にマージされる（式の肥大化防止）', () => {
    expect(
      buildBgmMixFilter(0.7, [
        { start: 0, end: 23.965 },
        { start: 23.965, end: 52.75 },
        { start: 52.75, end: 58 },
      ])
    ).toBe(
      "[1:a]volume=0.7[bgm0];[bgm0]volume=0.28:enable='between(t,0,58)'[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]"
    )
  })

  it('出力上限（60秒）以降の区間は式に含めず、跨ぐ区間は60秒で打ち切る', () => {
    expect(
      buildBgmMixFilter(0.7, [
        { start: 50, end: 70 },
        { start: 100, end: 200 },
      ])
    ).toBe(
      "[1:a]volume=0.7[bgm0];[bgm0]volume=0.28:enable='between(t,50,60)'[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]"
    )
  })

  it('60秒以降の区間しか無い場合はダッキングなしの単純mixになる', () => {
    expect(buildBgmMixFilter(0.7, [{ start: 100, end: 200 }])).toBe(
      '[1:a]volume=0.7[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]'
    )
  })
})

describe('buildVideoBgmVolumeRanges', () => {
  it('動画セグメント区間だけ BGM をさらに下げる範囲を作る', () => {
    expect(
      buildVideoBgmVolumeRanges([
        { durationSeconds: 3, type: 'image' },
        { durationSeconds: 5.2, type: 'video' },
        { durationSeconds: 4.3, type: 'image' },
        { durationSeconds: 2.5, type: 'video' },
      ])
    ).toEqual([
      { start: 3, end: 8.2 },
      { start: 12.5, end: 15 },
    ])
  })
})

describe('buildConcatListContent', () => {
  it('concat demuxer 用の file list を組み立てる', () => {
    expect(
      buildConcatListContent(['/tmp/segment-0000.mp4', "/tmp/it's-ok.mp4"])
    ).toBe("file '/tmp/segment-0000.mp4'\nfile '/tmp/it'\\''s-ok.mp4'\n")
  })
})

describe('buildStagedOutputPath', () => {
  it('最終成果物と同名の一時ファイルをローカル temp に作る', () => {
    expect(
      buildStagedOutputPath(
        '/private/var/folders/tmp/render-1234',
        '/Volumes/NAS/highlights/2026-03-31_highlight.mp4'
      )
    ).toBe('/private/var/folders/tmp/render-1234/2026-03-31_highlight.mp4')
  })
})

describe('buildCachedSegmentSourcePath', () => {
  it('元メディアをローカル temp に退避するパスを作る', () => {
    expect(
      buildCachedSegmentSourcePath(
        '/private/var/folders/tmp/render-1234',
        7,
        '/Volumes/NAS/photo/PXL_20260329_025227801.jpg'
      )
    ).toBe(
      '/private/var/folders/tmp/render-1234/source-0007-PXL_20260329_025227801.jpg'
    )
  })
})

describe('shouldThrottleAfterFfmpegRun', () => {
  it('待機時間が 0 より大きければ最終工程以外で待機する', () => {
    expect(shouldThrottleAfterFfmpegRun(0, 3, 1500)).toBe(true)
    expect(shouldThrottleAfterFfmpegRun(1, 3, 1500)).toBe(true)
    expect(shouldThrottleAfterFfmpegRun(2, 3, 1500)).toBe(false)
  })

  it('待機時間が 0 なら待機しない', () => {
    expect(shouldThrottleAfterFfmpegRun(0, 3, 0)).toBe(false)
  })
})
