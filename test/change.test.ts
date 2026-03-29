import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { calculateFrameDiff, combineChangeScore } from '../src/analyzers/change'

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

async function writeSolidImage(filePath: string, value: number) {
  await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: {
        r: value,
        g: value,
        b: value,
      },
    },
  }).png().toFile(filePath)
}

describe('calculateFrameDiff', () => {
  it('見た目が大きく違うフレームほど差分が大きい', async () => {
    const dir = makeDir()
    const black = path.join(dir, 'black.png')
    const white = path.join(dir, 'white.png')

    await writeSolidImage(black, 0)
    await writeSolidImage(white, 255)

    expect(await calculateFrameDiff(black, white)).toBe(1)
  })
})

describe('combineChangeScore', () => {
  it('frame diff と scene change と expression delta を重み付き合成する', () => {
    expect(combineChangeScore({
      frameDiff: 1,
      sceneChange: 0.5,
      expressionDelta: 0.25,
    })).toBeCloseTo(0.7, 5)
  })
})
