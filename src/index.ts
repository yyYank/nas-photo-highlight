import cron from 'node-cron'
import { validateConfig, config } from './config.js'
import { runPipeline } from './pipeline.js'
import { startWebServer } from './server.js'
import { notifyLatestRun, sendNotification } from './notify.js'

validateConfig()

const args = process.argv.slice(2)
const inputListIndex = args.indexOf('--input-list')
const inputListPath = inputListIndex >= 0 ? args[inputListIndex + 1] : undefined

if (inputListIndex >= 0 && !inputListPath) {
  throw new Error('Usage: bun run generate --input-list /path/to/input-files.txt')
}

if (args.includes('--run-now')) {
  // One-shot: process immediately and exit
  await runPipeline({
    force: args.includes('--force'),
    inputListPath,
  })
  process.exit(0)
} else if (args.includes('--notify')) {
  await notifyLatestRun(config.nas.outputPath)
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
