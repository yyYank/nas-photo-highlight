import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import { syncViewerAssets } from '../src/viewerAssets'

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

describe('syncViewerAssets', () => {
  it('NAS 出力先へ index.html をコピーする', () => {
    const outputDir = makeDir()

    syncViewerAssets(outputDir)

    const copiedHtml = readFileSync(path.join(outputDir, 'index.html'), 'utf8')
    expect(copiedHtml).toContain('PHOTO HIGHLIGHTS')
    expect(copiedHtml).toContain("fetch('/highlights.json')")
    expect(copiedHtml).toContain('`/media/${h.relative_path}`')
    expect(copiedHtml).toContain('h.thumbnail_relative_path')
    expect(copiedHtml).toContain('poster="${thumbnailUrl}"')
  })
})
