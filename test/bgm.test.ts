import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { pickRandomItem, resolveBgmPath } from '../src/generator/bgm'

describe('pickRandomItem', () => {
  it('random が 0 を返すとき先頭要素を選ぶ', () => {
    expect(pickRandomItem(['a', 'b', 'c'], () => 0)).toBe('a')
  })

  it('random が 1 未満の最大値付近を返すとき末尾要素を選ぶ', () => {
    expect(pickRandomItem(['a', 'b', 'c'], () => 0.999)).toBe('c')
  })

  it('空配列を渡すと例外を投げる', () => {
    expect(() => pickRandomItem([], () => 0)).toThrow()
  })
})

describe('resolveBgmPath', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'bgm-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('空文字列なら undefined を返す', () => {
    expect(resolveBgmPath('')).toBeUndefined()
  })

  it('ファイルパスを指定した場合はそのまま返す（互換維持）', () => {
    const filePath = path.join(tempDir, 'song.mp3')
    writeFileSync(filePath, '')
    expect(resolveBgmPath(filePath)).toBe(filePath)
  })

  it('存在しないパスを指定した場合はそのまま返す（従来 ffmpeg 側でエラーになる挙動を維持）', () => {
    const missingPath = path.join(tempDir, 'missing.mp3')
    expect(resolveBgmPath(missingPath)).toBe(missingPath)
  })

  it('ディレクトリを指定した場合、直下の .mp3 からランダムに1曲選ぶ', () => {
    writeFileSync(path.join(tempDir, 'a.mp3'), '')
    writeFileSync(path.join(tempDir, 'b.mp3'), '')
    writeFileSync(path.join(tempDir, 'c.mp3'), '')

    const result = resolveBgmPath(tempDir, () => 0)
    expect(result).toBe(path.join(tempDir, 'a.mp3'))
  })

  it('大文字拡張子 .MP3 も対象にする', () => {
    writeFileSync(path.join(tempDir, 'UPPER.MP3'), '')

    const result = resolveBgmPath(tempDir, () => 0)
    expect(result).toBe(path.join(tempDir, 'UPPER.MP3'))
  })

  it('.mp3 以外のファイルは無視する', () => {
    writeFileSync(path.join(tempDir, 'a.mp3'), '')
    writeFileSync(path.join(tempDir, 'notes.txt'), '')

    const result = resolveBgmPath(tempDir, () => 0.999)
    expect(result).toBe(path.join(tempDir, 'a.mp3'))
  })

  it('ディレクトリ内に .mp3 が無い場合は undefined を返し、警告ログを出す', () => {
    writeFileSync(path.join(tempDir, 'notes.txt'), '')

    const warnSpy: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnSpy.push(args.map(String).join(' '))
    }

    try {
      const result = resolveBgmPath(tempDir)
      expect(result).toBeUndefined()
      expect(warnSpy.length).toBe(1)
    } finally {
      console.warn = originalWarn
    }
  })
})
