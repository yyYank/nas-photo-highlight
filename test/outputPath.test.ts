import { describe, expect, it } from 'bun:test'
import {
  prepareMetaOutputPath,
  prepareOutputPath,
  resolveOutputPath,
  resolveOutputPathForGroup,
} from '../src/outputPath'

describe('resolveOutputPath', () => {
  it('実行日で年と月のプレースホルダーを展開する', () => {
    const resolved = resolveOutputPath(
      '/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}',
      new Date('2026-03-27T10:00:00+09:00')
    )

    expect(resolved).toBe('/Volumes/home/Photos/PhotoLibrary/2026/03')
  })

  it('プレースホルダーがなければ元のパスをそのまま返す', () => {
    const resolved = resolveOutputPath(
      '/Volumes/home/Photos/PhotoLibrary',
      new Date('2026-03-27T10:00:00+09:00')
    )

    expect(resolved).toBe('/Volumes/home/Photos/PhotoLibrary')
  })
})

describe('resolveOutputPathForGroup', () => {
  it('グループキーが撮影日（YYYY-MM-DD）形式なら、その年月で {yyyy}/{mm} を展開する', () => {
    // 実行日（2026-07-13）ではなく、撮影日グループキー（2026-03-27）の年月が使われることを検証する
    const resolved = resolveOutputPathForGroup(
      '/Volumes/home/Photos/highlights/media/{yyyy}/{mm}',
      '2026-03-27',
      new Date('2026-07-13T10:00:00+09:00')
    )

    expect(resolved).toBe('/Volumes/home/Photos/highlights/media/2026/03')
  })

  it('グループキーが日付形式でなければ、実行日（fallbackDate）で {yyyy}/{mm} を展開する', () => {
    // GROUP_BY=folder のようにグループキーが日付でない場合のフォールバック挙動を検証する
    const resolved = resolveOutputPathForGroup(
      '/Volumes/home/Photos/highlights/media/{yyyy}/{mm}',
      'my-trip-folder',
      new Date('2026-07-13T10:00:00+09:00')
    )

    expect(resolved).toBe('/Volumes/home/Photos/highlights/media/2026/07')
  })

  it('fallbackDate を省略した場合は現在日時を使う', () => {
    // デフォルト引数（new Date()）が機能することを、非日付グループキーで確認する
    const now = new Date()
    const expectedYyyy = String(now.getFullYear())
    const expectedMm = String(now.getMonth() + 1).padStart(2, '0')

    const resolved = resolveOutputPathForGroup(
      '/Volumes/home/Photos/highlights/media/{yyyy}/{mm}',
      'my-trip-folder'
    )

    expect(resolved).toBe(
      `/Volumes/home/Photos/highlights/media/${expectedYyyy}/${expectedMm}`
    )
  })
})

describe('prepareOutputPath', () => {
  it('書き込み権限がない場合は分かりやすいエラーを返す', () => {
    const error = new Error('permission denied') as NodeJS.ErrnoException
    error.code = 'EACCES'

    expect(() =>
      prepareOutputPath('/Volumes/highlights', {
        mkdir: () => {
          throw error
        },
      })
    ).toThrow(
      'NAS_OUTPUT_PATH "/Volumes/highlights" を準備できませんでした。NAS が未マウントか、書き込み権限がありません。'
    )
  })

  it('出力先が見つからない場合は分かりやすいエラーを返す', () => {
    const error = new Error(
      'no such file or directory'
    ) as NodeJS.ErrnoException
    error.code = 'ENOENT'

    expect(() =>
      prepareOutputPath('/Volumes/highlights', {
        mkdir: () => {
          throw error
        },
      })
    ).toThrow(
      'NAS_OUTPUT_PATH "/Volumes/highlights" を準備できませんでした。NAS が未マウントか、書き込み権限がありません。'
    )
  })
})

describe('prepareMetaOutputPath', () => {
  it('メタ出力先では viewer assets を同期する', () => {
    const mkdirCalls: string[] = []
    const syncCalls: string[] = []

    prepareMetaOutputPath('/Volumes/highlights-meta', {
      mkdir: (target) => {
        mkdirCalls.push(target)
      },
      syncAssets: (target) => {
        syncCalls.push(target)
      },
    })

    expect(mkdirCalls).toEqual(['/Volumes/highlights-meta'])
    expect(syncCalls).toEqual(['/Volumes/highlights-meta'])
  })
})
