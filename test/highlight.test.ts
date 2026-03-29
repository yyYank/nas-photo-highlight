import { describe, expect, it } from 'bun:test'
import { buildHighlightFilterGraph, buildHighlightVideoFilters } from '../src/generator/highlight'

describe('buildHighlightVideoFilters', () => {
  it('スマホ向けの縦長フレーム内で切らずに最大表示する', () => {
    const filters = buildHighlightVideoFilters(3)

    expect(filters).toEqual([
      'scale=1080:1920:force_original_aspect_ratio=decrease',
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
      "zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.001))':d=90:s=1080x1920:fps=30",
    ])
  })
})

describe('buildHighlightFilterGraph', () => {
  it('画像と動画を同じ縦動画フォーマットへ正規化して連結する', () => {
    const graph = buildHighlightFilterGraph([
      { path: '/Volumes/photo/a.jpg', type: 'image' },
      { path: '/Volumes/photo/b.mov', type: 'video' },
    ], 3)

    expect(graph).toEqual([
      "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.001))':d=90:s=1080x1920:fps=30,setsar=1[v0]",
      '[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1[v1]',
      '[v0][v1]concat=n=2:v=1:a=0[vout]',
    ])
  })
})
