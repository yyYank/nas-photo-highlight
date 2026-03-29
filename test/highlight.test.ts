import { describe, expect, it } from 'bun:test'
import {
  buildConcatListContent,
  buildFinalHighlightOutputOptions,
  buildImageSegmentFilters,
  buildImageSegmentOutputOptions,
  buildVideoSegmentFilters,
  buildVideoSegmentOutputOptions,
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
      '-map 0:v:0',
      '-map 1:a:0',
      '-shortest',
      '-t 3',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
      '-r 30',
    ])
  })
})

describe('buildVideoSegmentOutputOptions', () => {
  it('元動画に音声があればそれを使う', () => {
    expect(buildVideoSegmentOutputOptions(true)).toEqual([
      '-map 0:v:0',
      '-map 0:a:0',
      '-shortest',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
      '-r 30',
    ])
  })

  it('元動画に音声がなければ無音トラックを使う', () => {
    expect(buildVideoSegmentOutputOptions(false)).toEqual([
      '-map 0:v:0',
      '-map 1:a:0',
      '-shortest',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
      '-r 30',
    ])
  })
})

describe('buildFinalHighlightOutputOptions', () => {
  it('最終動画を 60 秒で打ち切る', () => {
    expect(buildFinalHighlightOutputOptions()).toEqual([
      '-map 0:v:0',
      '-map 0:a:0',
      '-t 60',
      '-movflags +faststart',
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
