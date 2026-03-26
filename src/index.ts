import cron from 'node-cron'
import { validateConfig, config } from './config.js'
import { runPipeline } from './pipeline.js'

validateConfig()

const args = process.argv.slice(2)

if (args.includes('--run-now')) {
  // One-shot: process immediately and exit
  await runPipeline({ force: args.includes('--force') })
  process.exit(0)
} else {
  // Daemon mode: run on schedule
  console.log(`📅 Scheduler started. Pipeline runs at: ${config.cronSchedule}`)
  console.log('   To run immediately: bun src/index.ts --run-now\n')

  cron.schedule(config.cronSchedule, () => {
    console.log('⏰ Scheduled pipeline starting...')
    runPipeline().catch(console.error)
  })
}
