import { describe, expect, it } from 'bun:test'
import { buildManifestHighlight, shouldSkipHighlightGeneration } from '../src/pipeline.js'

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

describe('buildManifestHighlight', () => {
  it('動画出力ルートからの相対パスを manifest に含める', () => {
    const result = buildManifestHighlight(
      {
        group_key: '2026-03-21',
        output_path: '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
        image_count: 8,
        created_at: '2026-03-27 00:22:35',
        id: 1,
        updated_at: '2026-03-27 00:22:35',
      },
      '/Volumes/home/Photos/PhotoLibrary'
    )

    expect(result).toEqual({
      group_key: '2026-03-21',
      filename: '2026-03-21_highlight.mp4',
      relative_path: '2026/03/2026-03-21_highlight.mp4',
      image_count: 8,
      created_at: '2026-03-27 00:22:35',
    })
  })
})
