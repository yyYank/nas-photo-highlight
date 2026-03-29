import { describe, expect, it } from 'bun:test'
import {
  buildConcatListContent,
  buildImageSegmentFilters,
  buildVideoSegmentFilters,
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

describe('buildConcatListContent', () => {
  it('concat demuxer 用の file list を組み立てる', () => {
    expect(
      buildConcatListContent(['/tmp/segment-0000.mp4', "/tmp/it's-ok.mp4"])
    ).toBe("file '/tmp/segment-0000.mp4'\nfile '/tmp/it'\\''s-ok.mp4'\n")
  })
})
