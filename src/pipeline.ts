import path from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { groupImages } from './scanner/grouper.js'
import { pickBestShots } from './scorer/imageScore.js'
import { generateHighlight } from './generator/highlight.js'
import { highlightDb } from './db/index.js'
import { config } from './config.js'
import { prepareMetaOutputPath, prepareOutputPath, resolveOutputPath } from './outputPath.js'
import { saveLastRunSummary, type PipelineRunSummary } from './notify.js'

/**
 * Write highlights.json to NAS output folder.
 * This is what Nginx (on the NAS) serves as the "API".
 */
function exportManifest() {
  const metaOutputPath = resolveOutputPath(config.nas.metaOutputPath)
  const highlights = highlightDb.list().map((h) => ({
    group_key: h.group_key,
    filename: path.basename(h.output_path),
    image_count: h.image_count,
    created_at: h.created_at,
  }))
  const dest = path.join(metaOutputPath, 'highlights.json')
  writeFileSync(dest, JSON.stringify(highlights, null, 2), 'utf8')
  console.log(`📄 Manifest written: ${dest}`)
}

export function shouldSkipHighlightGeneration({
  force,
  existingOutputPath,
  targetOutputPath,
}: {
  force: boolean
  existingOutputPath?: string
  targetOutputPath: string
}) {
  if (force) return false
  if (!existingOutputPath) return false

  return existingOutputPath === targetOutputPath
}

export async function runPipeline({
  force = false,
  inputListPath,
}: {
  force?: boolean
  inputListPath?: string
} = {}): Promise<PipelineRunSummary> {
  console.log('🔍 Scanning photos...')
  const resolvedMetaOutputPath = resolveOutputPath(config.nas.metaOutputPath)
  const resolvedOutputPath = resolveOutputPath(config.nas.outputPath)
  prepareMetaOutputPath(resolvedMetaOutputPath)
  prepareOutputPath(resolvedOutputPath)

  const groups = await groupImages(inputListPath)
  console.log(`📁 Found ${groups.size} groups`)

  let generated = 0
  const highlights: PipelineRunSummary['highlights'] = []

  for (const [key, images] of groups) {
    if (images.length < config.processing.minImagesToGenerate) {
      console.log(`⏭  Skipping ${key} (only ${images.length} images, min: ${config.processing.minImagesToGenerate})`)
      continue
    }

    const outputPath = path.join(resolvedOutputPath, `${key}_highlight.mp4`)
    const existingHighlight = highlightDb.find(key)

    if (shouldSkipHighlightGeneration({
      force,
      existingOutputPath: existingHighlight?.output_path,
      targetOutputPath: outputPath,
    })) {
      console.log(`⏭  Skipping ${key} (already generated)`)
      continue
    }

    console.log(`\n🎬 Processing: ${key} (${images.length} images)`)

    const best = await pickBestShots(images, config.processing.imagesPerHighlight)
    console.log(`  Selected ${best.length} best shots`)

    await generateHighlight(best, outputPath)

    highlightDb.upsert(key, outputPath, best.length)
    highlights.push({
      groupKey: key,
      outputPath,
      imageCount: best.length,
    })
    generated++
  }

  // Always refresh the manifest so the NAS viewer stays up to date
  exportManifest()

  const summary = {
    generated,
    finishedAt: new Date().toISOString(),
    outputPath: resolvedOutputPath,
    highlights,
  }
  saveLastRunSummary(resolvedMetaOutputPath, summary)

  console.log(`\n✅ Pipeline complete — ${generated} new highlight(s) generated`)
  return summary
}
