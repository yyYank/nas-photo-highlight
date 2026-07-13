import { describe, expect, it } from 'bun:test'
import {
  buildGroupOutputPath,
  buildHighlightSegments,
  buildManifestHighlight,
  buildThumbnailOutputPath,
  filterDeletedHighlights,
  loadDeletedKeys,
  normalizeDateRange,
  selectThumbnailSegment,
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
  it('動画とサムネイルの相対パスを manifest に含める', () => {
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
      thumbnail_relative_path: '2026/03/2026-03-21_highlight_thumb.jpg',
      image_count: 8,
      created_at: '2026-03-27 00:22:35',
    })
  })

  it('入力ライブラリと分離した出力ルート（highlights/media）でも相対パスを正しく組み立てる', () => {
    // NAS_OUTPUT_PATH が NAS_PHOTO_PATH 配下から分離された新しいルートでも
    // manifest の relative_path / thumbnail_relative_path が壊れないことを検証する
    const result = buildManifestHighlight(
      {
        group_key: '2026-03-27',
        output_path:
          '/Volumes/home/Photos/highlights/media/2026/03/2026-03-27_highlight.mp4',
        image_count: 10,
        created_at: '2026-03-27 00:22:35',
        id: 2,
        updated_at: '2026-03-27 00:22:35',
      },
      '/Volumes/home/Photos/highlights/media'
    )

    expect(result).toEqual({
      group_key: '2026-03-27',
      filename: '2026-03-27_highlight.mp4',
      relative_path: '2026/03/2026-03-27_highlight.mp4',
      thumbnail_relative_path: '2026/03/2026-03-27_highlight_thumb.jpg',
      image_count: 10,
      created_at: '2026-03-27 00:22:35',
    })
  })

  it('週開始日グループキー（YYYY-MM-DD）でも manifest に group_key がそのまま載る', () => {
    // span=weekly のグループキーが特別扱いなしで manifest に反映されることを確認する
    const result = buildManifestHighlight(
      {
        group_key: '2026-04-01',
        output_path:
          '/Volumes/home/Photos/highlights/media/2026/04/2026-04-01_highlight.mp4',
        image_count: 12,
        created_at: '2026-04-08 00:22:35',
        id: 3,
        updated_at: '2026-04-08 00:22:35',
      },
      '/Volumes/home/Photos/highlights/media'
    )

    expect(result).toEqual({
      group_key: '2026-04-01',
      filename: '2026-04-01_highlight.mp4',
      relative_path: '2026/04/2026-04-01_highlight.mp4',
      thumbnail_relative_path: '2026/04/2026-04-01_highlight_thumb.jpg',
      image_count: 12,
      created_at: '2026-04-08 00:22:35',
    })
  })
})

describe('buildGroupOutputPath', () => {
  it('撮影日グループキー（YYYY-MM-DD）から年月フォルダを解決して出力パスを組み立てる', () => {
    // 実行日ではなく、グループの撮影日（2026-03-27）の年月フォルダに保存されることを検証する
    const result = buildGroupOutputPath(
      '/Volumes/home/Photos/highlights/media/{yyyy}/{mm}',
      '2026-03-27',
      new Date('2026-07-13T10:00:00+09:00')
    )

    expect(result).toBe(
      '/Volumes/home/Photos/highlights/media/2026/03/2026-03-27_highlight.mp4'
    )
  })

  it('日付形式でないグループキー（GROUP_BY=folder）は実行日のフォルダにフォールバックする', () => {
    const result = buildGroupOutputPath(
      '/Volumes/home/Photos/highlights/media/{yyyy}/{mm}',
      'my-trip-folder',
      new Date('2026-07-13T10:00:00+09:00')
    )

    expect(result).toBe(
      '/Volumes/home/Photos/highlights/media/2026/07/my-trip-folder_highlight.mp4'
    )
  })

  it('週開始日グループキー（YYYY-MM-DD）から年月フォルダを解決して出力パスを組み立てる', () => {
    // span=weekly で生成したグループキー（2026-04-01）でも撮影年月フォルダに保存されることを検証する
    const result = buildGroupOutputPath(
      '/Volumes/home/Photos/highlights/media/{yyyy}/{mm}',
      '2026-04-01',
      new Date('2026-07-13T10:00:00+09:00')
    )

    expect(result).toBe(
      '/Volumes/home/Photos/highlights/media/2026/04/2026-04-01_highlight.mp4'
    )
  })
})

describe('buildThumbnailOutputPath', () => {
  it('動画パスからサムネイル jpg パスを作る', () => {
    expect(
      buildThumbnailOutputPath(
        '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4'
      )
    ).toBe(
      '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight_thumb.jpg'
    )
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

describe('filterDeletedHighlights', () => {
  it('削除済みキーに含まれるハイライトを manifest から除外する', () => {
    const highlights = [
      { group_key: '2026-03-21' },
      { group_key: '2026-03-22' },
    ]

    expect(filterDeletedHighlights(highlights, ['2026-03-21'])).toEqual([
      { group_key: '2026-03-22' },
    ])
  })

  it('削除済みキーが空なら全件そのまま返す', () => {
    const highlights = [{ group_key: '2026-03-21' }]

    expect(filterDeletedHighlights(highlights, [])).toEqual(highlights)
  })
})

describe('loadDeletedKeys', () => {
  it('deleted-keys.json が無ければ空配列を返す（ファイルは読みにいかない）', () => {
    const result = loadDeletedKeys('/tmp/does-not-matter', {
      exists: () => false,
      readFile: () => {
        throw new Error('exists=false のときは readFile を呼んではいけない')
      },
    })

    expect(result).toEqual([])
  })

  it('deleted-keys.json の内容を文字列配列として返す', () => {
    const result = loadDeletedKeys('/tmp/does-not-matter', {
      exists: () => true,
      readFile: () => JSON.stringify(['2026-03-21', '2026-03-22']),
    })

    expect(result).toEqual(['2026-03-21', '2026-03-22'])
  })

  it('壊れた JSON の場合は空配列にフォールバックする', () => {
    const result = loadDeletedKeys('/tmp/does-not-matter', {
      exists: () => true,
      readFile: () => '{not valid json',
    })

    expect(result).toEqual([])
  })
})

describe('selectThumbnailSegment', () => {
  it('選ばれたベストショット画像をサムネイルに使う', () => {
    expect(
      selectThumbnailSegment(
        [
          '/Volumes/home/Photos/2026/03/a.jpg',
          '/Volumes/home/Photos/2026/03/b.mov',
          '/Volumes/home/Photos/2026/03/c.jpg',
        ],
        ['/Volumes/home/Photos/2026/03/c.jpg']
      )
    ).toEqual({
      path: '/Volumes/home/Photos/2026/03/c.jpg',
      type: 'image',
    })
  })

  it('画像が無ければ先頭メディアをサムネイルに使う', () => {
    expect(
      selectThumbnailSegment(['/Volumes/home/Photos/2026/03/b.mov'], [])
    ).toEqual({
      path: '/Volumes/home/Photos/2026/03/b.mov',
      type: 'video',
    })
  })
})
