import path from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { groupImages } from './scanner/grouper.js'
import { pickBestShots } from './scorer/imageScore.js'
import { generateHighlight } from './generator/highlight.js'
import { highlightDb } from './db/index.js'
import { config } from './config.js'
import { prepareOutputPath } from './outputPath.js'

/**
 * Write highlights.json to NAS output folder.
 * This is what Nginx (on the NAS) serves as the "API".
 */
function exportManifest() {
  const highlights = highlightDb.list().map((h) => ({
    group_key: h.group_key,
    filename: path.basename(h.output_path),
    image_count: h.image_count,
    created_at: h.created_at,
  }))
  const dest = path.join(config.nas.outputPath, 'highlights.json')
  writeFileSync(dest, JSON.stringify(highlights, null, 2), 'utf8')
  console.log(`📄 Manifest written: ${dest}`)
}

export async function runPipeline({ force = false } = {}) {
  console.log('🔍 Scanning photos...')
  prepareOutputPath(config.nas.outputPath)

  const groups = await groupImages()
  console.log(`📁 Found ${groups.size} groups`)

  let generated = 0

  for (const [key, images] of groups) {
    if (images.length < config.processing.minImagesToGenerate) {
      console.log(`⏭  Skipping ${key} (only ${images.length} images, min: ${config.processing.minImagesToGenerate})`)
      continue
    }

    if (!force && highlightDb.exists(key)) {
      console.log(`⏭  Skipping ${key} (already generated)`)
      continue
    }

    console.log(`\n🎬 Processing: ${key} (${images.length} images)`)

    const best = await pickBestShots(images, config.processing.imagesPerHighlight)
    console.log(`  Selected ${best.length} best shots`)

    const outputPath = path.join(config.nas.outputPath, `${key}_highlight.mp4`)
    await generateHighlight(best, outputPath)

    highlightDb.upsert(key, outputPath, best.length)
    generated++
  }

  // Always refresh the manifest so the NAS viewer stays up to date
  exportManifest()

  console.log(`\n✅ Pipeline complete — ${generated} new highlight(s) generated`)
}
