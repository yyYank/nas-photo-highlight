import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { createStaticHandler } from '../src/server.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeOutputDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nas-photo-highlight-'))
  tempDirs.push(dir)
  return dir
}

describe('createStaticHandler', () => {
  it('ルートパスで Web UI を返す', async () => {
    const metaOutputDir = makeOutputDir()
    const mediaOutputDir = makeOutputDir()
    const handler = createStaticHandler({
      metaOutputPath: metaOutputDir,
      mediaOutputPath: mediaOutputDir,
      uiHtml: '<!DOCTYPE html><title>ui</title>',
    })

    const response = await handler(new Request('http://localhost:3000/'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('<title>ui</title>')
  })

  it('生成済み manifest を返す', async () => {
    const metaOutputDir = makeOutputDir()
    const mediaOutputDir = makeOutputDir()
    writeFileSync(path.join(metaOutputDir, 'highlights.json'), '[]', 'utf8')
    const handler = createStaticHandler({
      metaOutputPath: metaOutputDir,
      mediaOutputPath: mediaOutputDir,
      uiHtml: '<!DOCTYPE html><title>ui</title>',
    })

    const response = await handler(new Request('http://localhost:3000/highlights.json'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.text()).toBe('[]')
  })

  it('動画ファイルを返す', async () => {
    const metaOutputDir = makeOutputDir()
    const mediaOutputDir = makeOutputDir()
    const body = 'fake-mp4'
    writeFileSync(path.join(mediaOutputDir, 'demo.mp4'), body, 'utf8')
    const handler = createStaticHandler({
      metaOutputPath: metaOutputDir,
      mediaOutputPath: mediaOutputDir,
      uiHtml: '<!DOCTYPE html><title>ui</title>',
    })

    const response = await handler(new Request('http://localhost:3000/demo.mp4'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('video/mp4')
    expect(await response.text()).toBe(body)
  })
})
