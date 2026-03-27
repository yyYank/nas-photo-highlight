import { describe, expect, it } from 'bun:test'
import { prepareMetaOutputPath, prepareOutputPath, resolveOutputPath } from '../src/outputPath.js'

describe('resolveOutputPath', () => {
  it('実行日で年と月のプレースホルダーを展開する', () => {
    const resolved = resolveOutputPath('/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}', new Date('2026-03-27T10:00:00+09:00'))

    expect(resolved).toBe('/Volumes/home/Photos/PhotoLibrary/2026/03')
  })

  it('プレースホルダーがなければ元のパスをそのまま返す', () => {
    const resolved = resolveOutputPath('/Volumes/home/Photos/PhotoLibrary', new Date('2026-03-27T10:00:00+09:00'))

    expect(resolved).toBe('/Volumes/home/Photos/PhotoLibrary')
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
    ).toThrow('NAS_OUTPUT_PATH "/Volumes/highlights" を準備できませんでした。NAS が未マウントか、書き込み権限がありません。')
  })

  it('出力先が見つからない場合は分かりやすいエラーを返す', () => {
    const error = new Error('no such file or directory') as NodeJS.ErrnoException
    error.code = 'ENOENT'

    expect(() =>
      prepareOutputPath('/Volumes/highlights', {
        mkdir: () => {
          throw error
        },
      })
    ).toThrow('NAS_OUTPUT_PATH "/Volumes/highlights" を準備できませんでした。NAS が未マウントか、書き込み権限がありません。')
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
