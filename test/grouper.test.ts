import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import {
  filterMediaByDateRange,
  groupListedMedia,
  groupListedImages,
  isImagePath,
  isVideoPath,
  readInputList,
} from '../src/scanner/grouper'

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
  it('画像と動画の拡張子を判定できる', () => {
    expect(isImagePath('/Volumes/photo/a.jpg')).toBe(true)
    expect(isVideoPath('/Volumes/photo/a.mov')).toBe(true)
    expect(isImagePath('/Volumes/photo/a.mov')).toBe(false)
    expect(isVideoPath('/Volumes/photo/a.txt')).toBe(false)
  })

  it('folder 指定なら親フォルダ名でグループ化する', async () => {
    const groups = await groupListedImages(
      [
        '/Volumes/photo/trip/a.jpg',
        '/Volumes/photo/trip/b.jpg',
        '/Volumes/photo/family/c.jpg',
      ],
      'folder',
      async () => 'unused',
      async () => new Date('2026-03-20T00:00:00.000Z')
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
      },
      async () => new Date('2026-03-20T00:00:00.000Z')
    )

    expect(groups.get('2026-03-20')).toEqual([
      '/Volumes/photo/trip/a.jpg',
      '/Volumes/photo/trip/b.jpg',
    ])
    expect(groups.get('2026-03-21')).toEqual(['/Volumes/photo/family/c.jpg'])
  })

  it('グループ内では撮影順に画像と動画を並べる', async () => {
    const groups = await groupListedMedia(
      [
        '/Volumes/photo/trip/c.mov',
        '/Volumes/photo/trip/a.jpg',
        '/Volumes/photo/trip/b.jpg',
      ],
      'folder',
      async () => 'trip',
      async (mediaPath) => {
        if (mediaPath.endsWith('a.jpg'))
          return new Date('2026-03-20T10:00:00.000Z')
        if (mediaPath.endsWith('c.mov'))
          return new Date('2026-03-20T10:01:00.000Z')
        return new Date('2026-03-20T10:02:00.000Z')
      }
    )

    expect(groups.get('trip')).toEqual([
      '/Volumes/photo/trip/a.jpg',
      '/Volumes/photo/trip/c.mov',
      '/Volumes/photo/trip/b.jpg',
    ])
  })

  it('日付レンジでメディアを絞り込める', async () => {
    const result = await filterMediaByDateRange(
      [
        '/Volumes/photo/trip/a.jpg',
        '/Volumes/photo/trip/b.jpg',
        '/Volumes/photo/trip/c.mov',
      ],
      {
        dateFrom: '2026-03-02',
        dateTo: '2026-03-03',
      },
      async (mediaPath) => {
        if (mediaPath.endsWith('a.jpg')) return '2026-03-01'
        if (mediaPath.endsWith('b.jpg')) return '2026-03-02'
        return '2026-03-03'
      }
    )

    expect(result).toEqual([
      '/Volumes/photo/trip/b.jpg',
      '/Volumes/photo/trip/c.mov',
    ])
  })
})
