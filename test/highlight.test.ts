import { describe, expect, it } from 'bun:test'
import { buildHighlightVideoFilters } from '../src/generator/highlight.js'

describe('buildHighlightVideoFilters', () => {
  it('スマホ向けの縦長フレームを cover + crop で埋める', () => {
    const filters = buildHighlightVideoFilters(3)

    expect(filters).toEqual([
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      "zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.001))':d=90:s=1080x1920:fps=30",
    ])
  })
})
