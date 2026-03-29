import { describe, expect, it } from 'bun:test'
import {
  buildHighlightSegments,
  buildManifestHighlight,
  normalizeDateRange,
  shouldSkipHighlightGeneration,
} from '../src/pipeline'

describe('shouldSkipHighlightGeneration', () => {
  it('保存先が変わらなければ既存レコードをスキップする', () => {
    const result = shouldSkipHighlightGeneration({
      force: false,
      existingOutputPath:
        '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
      targetOutputPath:
        '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
    })

    expect(result).toBe(true)
  })

  it('保存先が変わったら再生成する', () => {
    const result = shouldSkipHighlightGeneration({
      force: false,
      existingOutputPath:
        '/Volumes/home/Photos/highlights/2026-03-21_highlight.mp4',
      targetOutputPath:
        '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
    })

    expect(result).toBe(false)
  })

  it('force 指定なら再生成する', () => {
    const result = shouldSkipHighlightGeneration({
      force: true,
      existingOutputPath:
        '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
      targetOutputPath:
        '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
    })

    expect(result).toBe(false)
  })
})

describe('buildManifestHighlight', () => {
  it('動画出力ルートからの相対パスを manifest に含める', () => {
    const result = buildManifestHighlight(
      {
        group_key: '2026-03-21',
        output_path:
          '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
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

describe('buildHighlightSegments', () => {
  it('選ばれた画像と動画を元の順序のまま差し込む', () => {
    const result = buildHighlightSegments(
      [
        '/Volumes/home/Photos/2026/03/a.jpg',
        '/Volumes/home/Photos/2026/03/b.mov',
        '/Volumes/home/Photos/2026/03/c.jpg',
        '/Volumes/home/Photos/2026/03/d.mp4',
      ],
      [
        '/Volumes/home/Photos/2026/03/a.jpg',
        '/Volumes/home/Photos/2026/03/c.jpg',
      ]
    )

    expect(result).toEqual([
      { path: '/Volumes/home/Photos/2026/03/a.jpg', type: 'image' },
      { path: '/Volumes/home/Photos/2026/03/b.mov', type: 'video' },
      { path: '/Volumes/home/Photos/2026/03/c.jpg', type: 'image' },
      { path: '/Volumes/home/Photos/2026/03/d.mp4', type: 'video' },
    ])
  })
})

describe('normalizeDateRange', () => {
  it('from/to があれば date range オブジェクトを返す', () => {
    expect(
      normalizeDateRange({
        dateFrom: '2026-03-01',
        dateTo: '2026-03-07',
      })
    ).toEqual({
      dateFrom: '2026-03-01',
      dateTo: '2026-03-07',
    })
  })

  it('どちらも無ければ undefined を返す', () => {
    expect(normalizeDateRange({})).toBeUndefined()
  })
})
