import { afterEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import {
  buildNotificationMessage,
  loadLastRunSummary,
  saveLastRunSummary,
  sendNotification,
} from '../src/notify.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  mock.restore()
})

function makeDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'synology-photo-highlight-'))
  tempDirs.push(dir)
  return dir
}

describe('notify', () => {
  it('直近の実行結果を保存して読み出せる', () => {
    const outputDir = makeDir()
    const summary = {
      generated: 2,
      finishedAt: '2026-03-26T12:34:56.000Z',
      outputPath: '/Volumes/highlights',
      highlights: [
        { groupKey: '2026-03-20', outputPath: '/Volumes/highlights/2026-03-20_highlight.mp4', imageCount: 10 },
        { groupKey: '2026-03-21', outputPath: '/Volumes/highlights/2026-03-21_highlight.mp4', imageCount: 12 },
      ],
    }

    saveLastRunSummary(outputDir, summary)

    const file = readFileSync(path.join(outputDir, 'last-run.json'), 'utf8')
    expect(file).toContain('"generated": 2')
    expect(loadLastRunSummary(outputDir)).toEqual(summary)
  })

  it('通知文に生成結果をまとめる', () => {
    const message = buildNotificationMessage({
      generated: 2,
      finishedAt: '2026-03-26T12:34:56.000Z',
      outputPath: '/Volumes/highlights',
      highlights: [
        { groupKey: '2026-03-20', outputPath: '/Volumes/highlights/2026-03-20_highlight.mp4', imageCount: 10 },
        { groupKey: '2026-03-21', outputPath: '/Volumes/highlights/2026-03-21_highlight.mp4', imageCount: 12 },
      ],
    })

    expect(message).toContain('2 new highlight(s)')
    expect(message).toContain('2026-03-20')
    expect(message).toContain('2026-03-21')
    expect(message).toContain('/Volumes/highlights')
  })

  it('webhook へ直近結果を送る', async () => {
    const send = mock(async (_url: string, init?: RequestInit) =>
      new Response(null, { status: 200 })
    )
    const summary = {
      generated: 1,
      finishedAt: '2026-03-26T12:34:56.000Z',
      outputPath: '/Volumes/highlights',
      highlights: [
        { groupKey: '2026-03-21', outputPath: '/Volumes/highlights/2026-03-21_highlight.mp4', imageCount: 12 },
      ],
    }

    await sendNotification(summary, {
      webhookUrl: 'https://example.com/webhook',
      send,
    })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe('https://example.com/webhook')
    expect(send.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(String(send.mock.calls[0]?.[1]?.body)).toContain('2026-03-21')
  })
})
