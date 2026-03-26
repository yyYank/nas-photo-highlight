import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { config } from './config.js'

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

export function buildNotificationMessage(summary: PipelineRunSummary): string {
  const lines = [
    `synology-photo-highlight: ${summary.generated} new highlight(s)`,
    `finished_at: ${summary.finishedAt}`,
    `output_path: ${summary.outputPath}`,
  ]

  if (summary.highlights.length > 0) {
    lines.push('highlights:')
    for (const highlight of summary.highlights) {
      lines.push(`- ${highlight.groupKey} (${highlight.imageCount} photos)`)
    }
  } else {
    lines.push('highlights: none')
  }

  return lines.join('\n')
}

export async function sendNotification(
  summary: PipelineRunSummary,
  {
    webhookUrl = config.notification.webhookUrl,
    send = fetch,
  }: {
    webhookUrl?: string
    send?: typeof fetch
  } = {}
) {
  if (!webhookUrl) {
    throw new Error('NOTIFY_WEBHOOK_URL is not set in .env')
  }

  const response = await send(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: buildNotificationMessage(summary) }),
  })

  if (!response.ok) {
    throw new Error(`Notification failed with status ${response.status}`)
  }
}

export async function notifyLatestRun(outputPath: string) {
  const summary = loadLastRunSummary(outputPath)
  await sendNotification(summary)
}
