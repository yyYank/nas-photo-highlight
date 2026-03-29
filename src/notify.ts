import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { config } from './config.js'
import { highlightDb } from './db/index.js'

export interface PipelineHighlightSummary {
  groupKey: string
  outputPath: string
  imageCount: number
}

export interface PipelineRunSummary {
  generated: number
  finishedAt: string
  outputPath: string
  highlights: PipelineHighlightSummary[]
}

const LAST_RUN_FILE = 'last-run.json'

function getLastRunPath(outputPath: string) {
  return path.join(outputPath, LAST_RUN_FILE)
}

export function saveLastRunSummary(outputPath: string, summary: PipelineRunSummary) {
  writeFileSync(getLastRunPath(outputPath), JSON.stringify(summary, null, 2), 'utf8')
}

export function loadLastRunSummary(outputPath: string): PipelineRunSummary {
  return JSON.parse(readFileSync(getLastRunPath(outputPath), 'utf8')) as PipelineRunSummary
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function buildHighlightMediaRelativePath(outputPath: string): string {
  return outputPath.split('/').slice(-3).join('/')
}

export function buildNotificationMessage(
  summary: PipelineRunSummary,
  {
    baseUrl = config.notification.baseUrl,
    recentHighlights = [],
  }: {
    baseUrl?: string
    recentHighlights?: PipelineHighlightSummary[]
  } = {}
): string {
  const lines = [
    `nas-photo-highlight: 新規ハイライト ${summary.generated} 件`,
    `完了日時: ${summary.finishedAt}`,
    `出力先: ${summary.outputPath}`,
  ]

  if (baseUrl) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
    lines.push('ビューア:')
    lines.push(`${normalizedBaseUrl}/`)
  }

  if (summary.highlights.length > 0) {
    lines.push('生成結果:')
    for (const highlight of summary.highlights) {
      lines.push(`- ${highlight.groupKey}（${highlight.imageCount} 枚）`)
    }

    if (baseUrl) {
      const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
      lines.push('リンク:')
      for (const highlight of summary.highlights) {
        lines.push(`- ${highlight.groupKey}: ${normalizedBaseUrl}/media/${buildHighlightMediaRelativePath(highlight.outputPath)}`)
      }
    }
  } else {
    lines.push('生成結果: なし')

    if (baseUrl && recentHighlights.length > 0) {
      const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
      lines.push('最新ハイライト:')
      for (const highlight of recentHighlights) {
        lines.push(`- ${highlight.groupKey}: ${normalizedBaseUrl}/media/${buildHighlightMediaRelativePath(highlight.outputPath)}`)
      }
    }
  }

  return lines.join('\n')
}

export function buildNotificationSubject(summary: PipelineRunSummary): string {
  return `nas-photo-highlight: 新規ハイライト ${summary.generated} 件`
}

interface SendMailMessage {
  from: string
  to: string
  subject: string
  text: string
}

async function createGmailSender() {
  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.notification.gmail.user,
      pass: config.notification.gmail.appPassword,
    },
  })

  return async (message: SendMailMessage) => {
    await transporter.sendMail(message)
  }
}

export async function sendNotification(
  summary: PipelineRunSummary,
  {
    provider = config.notification.provider,
    baseUrl = config.notification.baseUrl,
    recentHighlights = [],
    webhookUrl = config.notification.webhookUrl,
    gmail = config.notification.gmail,
    send = fetch,
    sendMail,
  }: {
    provider?: 'webhook' | 'gmail'
    baseUrl?: string
    recentHighlights?: PipelineHighlightSummary[]
    webhookUrl?: string
    gmail?: {
      from: string
      to: string
      user?: string
      appPassword?: string
    }
    send?: typeof fetch
    sendMail?: (message: SendMailMessage) => Promise<void>
  } = {}
) {
  if (provider === 'gmail') {
    if (!gmail.from || !gmail.to) {
      throw new Error('GMAIL_FROM or GMAIL_TO is not set in .env')
    }

    if (!sendMail && (!gmail.user || !gmail.appPassword)) {
      throw new Error('GMAIL_FROM, GMAIL_TO, GMAIL_USER, or GMAIL_APP_PASSWORD is not set in .env')
    }

    const gmailSender = sendMail ?? (await createGmailSender())
    await gmailSender({
      from: gmail.from,
      to: gmail.to,
      subject: buildNotificationSubject(summary),
      text: buildNotificationMessage(summary, { baseUrl, recentHighlights }),
    })
    return
  }

  if (!webhookUrl) {
    throw new Error('NOTIFY_WEBHOOK_URL is not set in .env')
  }

  const response = await send(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: buildNotificationMessage(summary, { baseUrl, recentHighlights }) }),
  })

  if (!response.ok) {
    throw new Error(`Notification failed with status ${response.status}`)
  }
}

export async function notifyLatestRun(outputPath: string) {
  const summary = loadLastRunSummary(outputPath)
  const recentHighlights = highlightDb.list().slice(0, 3).map((highlight) => ({
    groupKey: highlight.group_key,
    outputPath: highlight.output_path,
    imageCount: highlight.image_count,
  }))
  await sendNotification(summary, { recentHighlights })
}
