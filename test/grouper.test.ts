import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import {
  collectMedia,
  filterMediaByDateRange,
  groupListedMedia,
  groupListedImages,
  groupMediaByWeek,
  isImagePath,
  isVideoPath,
  readInputList,
  weekKeyFromDateKey,
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

describe('weekKeyFromDateKey', () => {
  it('日を4分割して週キーに変換する（1-7=w1, 8-14=w2, 15-21=w3, 22-末日=w4）', () => {
    expect(weekKeyFromDateKey('2026-04-01')).toBe('2026-04-w1')
    expect(weekKeyFromDateKey('2026-04-07')).toBe('2026-04-w1')
    expect(weekKeyFromDateKey('2026-04-08')).toBe('2026-04-w2')
    expect(weekKeyFromDateKey('2026-04-14')).toBe('2026-04-w2')
    expect(weekKeyFromDateKey('2026-04-15')).toBe('2026-04-w3')
    expect(weekKeyFromDateKey('2026-04-21')).toBe('2026-04-w3')
    expect(weekKeyFromDateKey('2026-04-22')).toBe('2026-04-w4')
    expect(weekKeyFromDateKey('2026-04-30')).toBe('2026-04-w4')
  })

  it('不正な日付キーなら例外を投げる', () => {
    expect(() => weekKeyFromDateKey('2026/04/01')).toThrow()
  })
})

describe('groupMediaByWeek', () => {
  it('指定した年月内のメディアだけを週キー（YYYY-MM-wN）でグループ化する', async () => {
    const groups = await groupMediaByWeek(
      [
        '/Volumes/photo/a.jpg', // 4/1 -> w1
        '/Volumes/photo/b.jpg', // 4/10 -> w2
        '/Volumes/photo/c.jpg', // 4/20 -> w3
        '/Volumes/photo/d.jpg', // 4/25 -> w4
        '/Volumes/photo/e.jpg', // 3/31 -> 対象月外なので除外
      ],
      2026,
      4,
      async (mediaPath) => {
        if (mediaPath.endsWith('a.jpg')) return '2026-04-01'
        if (mediaPath.endsWith('b.jpg')) return '2026-04-10'
        if (mediaPath.endsWith('c.jpg')) return '2026-04-20'
        if (mediaPath.endsWith('d.jpg')) return '2026-04-25'
        return '2026-03-31'
      },
      async (mediaPath) => new Date(`2026-04-01T00:00:00.000Z`)
    )

    expect(Array.from(groups.keys())).toEqual([
      '2026-04-w1',
      '2026-04-w2',
      '2026-04-w3',
      '2026-04-w4',
    ])
    expect(groups.get('2026-04-w1')).toEqual(['/Volumes/photo/a.jpg'])
    expect(groups.get('2026-04-w4')).toEqual(['/Volumes/photo/d.jpg'])
    // 対象月外（3/31）は除外されるため w1〜w4 の4グループのみ
    expect(groups.size).toBe(4)
  })

  it('同じ週内の複数日を1つの週グループにまとめる', async () => {
    const groups = await groupMediaByWeek(
      [
        '/Volumes/photo/a.jpg', // 4/1
        '/Volumes/photo/b.jpg', // 4/3
        '/Volumes/photo/c.jpg', // 4/7
      ],
      2026,
      4,
      async (mediaPath) => {
        if (mediaPath.endsWith('a.jpg')) return '2026-04-01'
        if (mediaPath.endsWith('b.jpg')) return '2026-04-03'
        return '2026-04-07'
      },
      async () => new Date('2026-04-01T00:00:00.000Z')
    )

    expect(groups.get('2026-04-w1')).toEqual([
      '/Volumes/photo/a.jpg',
      '/Volumes/photo/b.jpg',
      '/Volumes/photo/c.jpg',
    ])
  })
})

describe('collectMedia', () => {
  it('生成済みハイライト動画とサムネイルを入力スキャンから除外する', () => {
    const dir = makeDir()
    const originalsDir = path.join(dir, '2026', '03')
    mkdirSync(originalsDir, { recursive: true })

    const originalImage = path.join(originalsDir, 'IMG_0001.JPG')
    const originalVideo = path.join(originalsDir, 'IMG_0002.MOV')
    const generatedHighlight = path.join(
      originalsDir,
      '2026-03-21_highlight.mp4'
    )
    const generatedThumbnail = path.join(
      originalsDir,
      '2026-03-21_highlight_thumb.jpg'
    )

    for (const filePath of [
      originalImage,
      originalVideo,
      generatedHighlight,
      generatedThumbnail,
    ]) {
      writeFileSync(filePath, '')
    }

    expect(collectMedia(dir)).toEqual([originalImage, originalVideo])
  })
})
