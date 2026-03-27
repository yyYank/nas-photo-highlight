import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { groupListedImages, readInputList } from '../src/scanner/grouper.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nas-photo-highlight-'))
  tempDirs.push(dir)
  return dir
}

describe('readInputList', () => {
  it('空行を除いて画像パス一覧を読む', () => {
    const dir = makeDir()
    const listPath = path.join(dir, 'input-files.txt')
    writeFileSync(
      listPath,
      ['/Volumes/photo/a.jpg', '', '  ', '/Volumes/photo/b.heic'].join('\n'),
      'utf8'
    )

    expect(readInputList(listPath)).toEqual([
      '/Volumes/photo/a.jpg',
      '/Volumes/photo/b.heic',
    ])
  })
})

describe('groupListedImages', () => {
  it('folder 指定なら親フォルダ名でグループ化する', async () => {
    const groups = await groupListedImages(
      [
        '/Volumes/photo/trip/a.jpg',
        '/Volumes/photo/trip/b.jpg',
        '/Volumes/photo/family/c.jpg',
      ],
      'folder'
    )

    expect(groups.get('trip')).toEqual([
      '/Volumes/photo/trip/a.jpg',
      '/Volumes/photo/trip/b.jpg',
    ])
    expect(groups.get('family')).toEqual(['/Volumes/photo/family/c.jpg'])
  })

  it('date 指定なら日付キーでグループ化する', async () => {
    const groups = await groupListedImages(
      [
        '/Volumes/photo/trip/a.jpg',
        '/Volumes/photo/trip/b.jpg',
        '/Volumes/photo/family/c.jpg',
      ],
      'date',
      async (imagePath) => {
        if (imagePath.endsWith('a.jpg')) return '2026-03-20'
        if (imagePath.endsWith('b.jpg')) return '2026-03-20'
        return '2026-03-21'
      }
    )

    expect(groups.get('2026-03-20')).toEqual([
      '/Volumes/photo/trip/a.jpg',
      '/Volumes/photo/trip/b.jpg',
    ])
    expect(groups.get('2026-03-21')).toEqual(['/Volumes/photo/family/c.jpg'])
  })
})
