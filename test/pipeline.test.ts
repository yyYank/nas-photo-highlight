import { describe, expect, it } from 'bun:test'
import { shouldSkipHighlightGeneration } from '../src/pipeline.js'

describe('shouldSkipHighlightGeneration', () => {
  it('保存先が変わらなければ既存レコードをスキップする', () => {
    const result = shouldSkipHighlightGeneration({
      force: false,
      existingOutputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
      targetOutputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
    })

    expect(result).toBe(true)
  })

  it('保存先が変わったら再生成する', () => {
    const result = shouldSkipHighlightGeneration({
      force: false,
      existingOutputPath: '/Volumes/home/Photos/highlights/2026-03-21_highlight.mp4',
      targetOutputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
    })

    expect(result).toBe(false)
  })

  it('force 指定なら再生成する', () => {
    const result = shouldSkipHighlightGeneration({
      force: true,
      existingOutputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
      targetOutputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
    })

    expect(result).toBe(false)
  })
})
