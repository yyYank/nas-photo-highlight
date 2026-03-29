import { afterEach, describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import {
  buildNotificationMessage,
  loadLastRunSummary,
  saveLastRunSummary,
  sendNotification,
} from '../src/notify'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
  mock.restore()
})

function makeDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nas-photo-highlight-'))
  tempDirs.push(dir)
  return dir
}

describe('notify', () => {
  it('直近の実行結果を保存して読み出せる', () => {
    const metaOutputDir = makeDir()
    const summary = {
      generated: 2,
      finishedAt: '2026-03-26T12:34:56.000Z',
      outputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03',
      highlights: [
        {
          groupKey: '2026-03-20',
          outputPath:
            '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-20_highlight.mp4',
          imageCount: 10,
        },
        {
          groupKey: '2026-03-21',
          outputPath:
            '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
          imageCount: 12,
        },
      ],
    }

    saveLastRunSummary(metaOutputDir, summary)

    const file = readFileSync(path.join(metaOutputDir, 'last-run.json'), 'utf8')
    expect(file).toContain('"generated": 2')
    expect(loadLastRunSummary(metaOutputDir)).toEqual(summary)
  })

  it('通知文に生成結果をまとめる', () => {
    const message = buildNotificationMessage({
      generated: 2,
      finishedAt: '2026-03-26T12:34:56.000Z',
      outputPath: '/Volumes/highlights',
      highlights: [
        {
          groupKey: '2026-03-20',
          outputPath: '/Volumes/highlights/2026-03-20_highlight.mp4',
          imageCount: 10,
        },
        {
          groupKey: '2026-03-21',
          outputPath: '/Volumes/highlights/2026-03-21_highlight.mp4',
          imageCount: 12,
        },
      ],
    })

    expect(message).toContain('新規ハイライト 2 件')
    expect(message).toContain('2026-03-20')
    expect(message).toContain('2026-03-21')
    expect(message).toContain('出力先: /Volumes/highlights')
  })

  it('BASE_URL があると各ハイライトの URL を通知文に含める', () => {
    const message = buildNotificationMessage(
      {
        generated: 1,
        finishedAt: '2026-03-26T12:34:56.000Z',
        outputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03',
        highlights: [
          {
            groupKey: '2026-03-21',
            outputPath:
              '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
            imageCount: 12,
          },
        ],
      },
      { baseUrl: 'http://192.168.1.10:8888' }
    )

    expect(message).toContain('リンク:')
    expect(message).toContain(
      'http://192.168.1.10:8888/media/2026/03/2026-03-21_highlight.mp4'
    )
  })

  it('BASE_URL があると Viewer URL を常に通知文に含める', () => {
    const message = buildNotificationMessage(
      {
        generated: 0,
        finishedAt: '2026-03-26T12:34:56.000Z',
        outputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03',
        highlights: [],
      },
      {
        baseUrl: 'http://192.168.1.10:8888',
        recentHighlights: [
          {
            groupKey: '2026-03-21',
            outputPath:
              '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
            imageCount: 12,
          },
        ],
      }
    )

    expect(message).toContain('ビューア:')
    expect(message).toContain('http://192.168.1.10:8888/')
  })

  it('新規生成がなくても recentHighlights があれば URL を通知文に含める', () => {
    const message = buildNotificationMessage(
      {
        generated: 0,
        finishedAt: '2026-03-26T12:34:56.000Z',
        outputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03',
        highlights: [],
      },
      {
        baseUrl: 'http://192.168.1.10:8888',
        recentHighlights: [
          {
            groupKey: '2026-03-21',
            outputPath:
              '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
            imageCount: 12,
          },
          {
            groupKey: '2026-03-07',
            outputPath:
              '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-07_highlight.mp4',
            imageCount: 13,
          },
        ],
      }
    )

    expect(message).toContain('最新ハイライト:')
    expect(message).toContain(
      'http://192.168.1.10:8888/media/2026/03/2026-03-21_highlight.mp4'
    )
    expect(message).toContain(
      'http://192.168.1.10:8888/media/2026/03/2026-03-07_highlight.mp4'
    )
  })

  it('webhook へ直近結果を送る', async () => {
    const send = mock(
      async (_url: string, _init?: RequestInit) =>
        new Response(null, { status: 200 })
    )
    const summary = {
      generated: 1,
      finishedAt: '2026-03-26T12:34:56.000Z',
      outputPath: '/Volumes/highlights',
      highlights: [
        {
          groupKey: '2026-03-21',
          outputPath: '/Volumes/highlights/2026-03-21_highlight.mp4',
          imageCount: 12,
        },
      ],
    }

    await sendNotification(summary, {
      provider: 'webhook',
      webhookUrl: 'https://example.com/webhook',
      send,
    })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0]).toBe('https://example.com/webhook')
    expect(send.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(String(send.mock.calls[0]?.[1]?.body)).toContain('2026-03-21')
  })

  it('gmail provider ならメール送信を使う', async () => {
    const sendMail = mock(
      async (_mail: {
        from: string
        to: string
        subject: string
        text: string
      }) => undefined
    )
    const summary = {
      generated: 1,
      finishedAt: '2026-03-26T12:34:56.000Z',
      outputPath: '/Volumes/highlights',
      highlights: [
        {
          groupKey: '2026-03-21',
          outputPath: '/Volumes/highlights/2026-03-21_highlight.mp4',
          imageCount: 12,
        },
      ],
    }

    await sendNotification(summary, {
      provider: 'gmail',
      gmail: {
        from: 'from@example.com',
        to: 'to@example.com',
      },
      sendMail,
    })

    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0]?.[0]).toEqual({
      from: 'from@example.com',
      to: 'to@example.com',
      subject: 'nas-photo-highlight: 新規ハイライト 1 件',
      text: expect.stringContaining('2026-03-21'),
    })
  })

  it('gmail provider なら本文にハイライト URL を含める', async () => {
    const sendMail = mock(
      async (_mail: {
        from: string
        to: string
        subject: string
        text: string
      }) => undefined
    )
    const summary = {
      generated: 1,
      finishedAt: '2026-03-26T12:34:56.000Z',
      outputPath: '/Volumes/home/Photos/PhotoLibrary/2026/03',
      highlights: [
        {
          groupKey: '2026-03-21',
          outputPath:
            '/Volumes/home/Photos/PhotoLibrary/2026/03/2026-03-21_highlight.mp4',
          imageCount: 12,
        },
      ],
    }

    await sendNotification(summary, {
      provider: 'gmail',
      gmail: {
        from: 'from@example.com',
        to: 'to@example.com',
      },
      baseUrl: 'http://192.168.1.10:8888',
      sendMail,
    })

    expect(sendMail.mock.calls[0]?.[0]?.text).toContain(
      'http://192.168.1.10:8888/media/2026/03/2026-03-21_highlight.mp4'
    )
  })
})
