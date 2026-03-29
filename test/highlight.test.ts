import { describe, expect, it } from 'bun:test'
import { buildHighlightVideoFilters } from '../src/generator/highlight.js'

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
