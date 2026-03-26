import { describe, expect, it } from 'bun:test'
import { prepareOutputPath } from '../src/outputPath.js'

describe('prepareOutputPath', () => {
  it('書き込み権限がない場合は分かりやすいエラーを返す', () => {
    const error = new Error('permission denied') as NodeJS.ErrnoException
    error.code = 'EACCES'

    expect(() =>
      prepareOutputPath('/Volumes/highlights', {
        mkdir: () => {
          throw error
        },
        syncAssets: () => {},
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
        syncAssets: () => {},
      })
    ).toThrow('NAS_OUTPUT_PATH "/Volumes/highlights" を準備できませんでした。NAS が未マウントか、書き込み権限がありません。')
  })
})
