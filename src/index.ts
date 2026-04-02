import cron from 'node-cron'
import { validateConfig, config } from './config'
import { runPipeline } from './pipeline'
import { startWebServer } from './server'
import { notifyLatestRun, sendNotification } from './notify'
import { resolveOutputPath } from './outputPath'
import { parseGenerateOptions } from './cli/generateOptions'

validateConfig()

const options = parseGenerateOptions(process.argv.slice(2))

if (options.runNow) {
  // One-shot: process immediately and exit
  await runPipeline({
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    dryRun: options.dryRun,
    ffmpegThrottleMs: options.ffmpegThrottleMs,
    force: options.force,
    inputListPath: options.inputListPath,
  })
  process.exit(0)
} else if (options.notify) {
  await notifyLatestRun(resolveOutputPath(config.nas.metaOutputPath))
  console.log('🔔 Notification sent')
  process.exit(0)
} else {
  // Daemon mode: run on schedule
  startWebServer()
  console.log(`🌐 Web UI started: http://localhost:${config.port}`)
  console.log(`📅 Scheduler started. Pipeline runs at: ${config.cronSchedule}`)
  console.log('   To run immediately: bun run generate\n')
  console.log('   To force regenerate: bun run generate:force\n')
  console.log('   To notify latest run: bun run notify\n')

  cron.schedule(config.cronSchedule, async () => {
    console.log('⏰ Scheduled pipeline starting...')
    try {
      const summary = await runPipeline()
      if (config.notification.webhookUrl) {
        await sendNotification(summary)
        console.log('🔔 Notification sent')
      } else {
        console.log('🔕 Notification skipped (NOTIFY_WEBHOOK_URL is not set)')
      }
    } catch (error) {
      console.error(error)
    }
  })
}
