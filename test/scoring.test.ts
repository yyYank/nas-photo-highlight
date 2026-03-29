import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { calculateTotalScore, scoreVideoFrames } from '../src/core/scoring.js'

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

async function writeGradient(filePath: string, start: number, end: number) {
  const width = 64
  const height = 64
  const pixels = new Uint8Array(width * height * 3)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = Math.round(start + ((end - start) * x / (width - 1)))
      const offset = (y * width + x) * 3
      pixels[offset] = value
      pixels[offset + 1] = value
      pixels[offset + 2] = value
    }
  }

  await sharp(pixels, {
    raw: {
      width,
      height,
      channels: 3,
    },
  }).png().toFile(filePath)
}

describe('calculateTotalScore', () => {
  it('親 issue の初期重みで総合スコアを計算する', () => {
    expect(calculateTotalScore({
      expression: 0.6,
      change: 0.4,
      focus: 0.2,
      bonus: 0.1,
    })).toBeCloseTo(0.39, 5)
  })
})

describe('scoreVideoFrames', () => {
  it('フレーム列に focus/change/total を付与する', async () => {
    const dir = makeDir()
    const a = path.join(dir, 'a.png')
    const b = path.join(dir, 'b.png')

    await writeGradient(a, 0, 255)
    await writeGradient(b, 255, 0)

    const scores = await scoreVideoFrames([
      { path: a, time: 0, sceneChange: 0 },
      { path: b, time: 0.25, sceneChange: 0.7 },
    ])

    expect(scores).toHaveLength(2)
    expect(scores[0]?.time).toBe(0)
    expect(scores[1]?.change).toBeGreaterThan(scores[0]?.change ?? 0)
    expect(scores[0]?.focus).toBeGreaterThanOrEqual(0)
    expect(scores[1]?.total).toBeGreaterThanOrEqual(0)
  })
})
