import path from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { groupImages, isImagePath, isVideoPath } from './scanner/grouper'
import { pickBestShots } from './scorer/imageScore'
import { generateHighlight, type HighlightSegment } from './generator/highlight'
import { highlightDb } from './db/index'
import { config } from './config'
import { prepareMetaOutputPath, prepareOutputPath, resolveOutputPath } from './outputPath'
import { saveLastRunSummary, type PipelineRunSummary } from './notify'
import type { HighlightRecord } from './db/index'

/**
 * Write highlights.json to NAS output folder.
 * This is what Nginx (on the NAS) serves as the "API".
 */
export function buildManifestHighlight(highlight: HighlightRecord, mediaRootPath: string) {
  return {
    group_key: highlight.group_key,
    filename: path.basename(highlight.output_path),
    relative_path: path.relative(mediaRootPath, highlight.output_path).split(path.sep).join('/'),
    image_count: highlight.image_count,
    created_at: highlight.created_at,
  }
}

function exportManifest() {
  const metaOutputPath = resolveOutputPath(config.nas.metaOutputPath)
  const mediaRootPath = normalizeMediaRootPath(config.nas.outputPath)
  const highlights = highlightDb.list().map((h) => buildManifestHighlight(h, mediaRootPath))
  const dest = path.join(metaOutputPath, 'highlights.json')
  writeFileSync(dest, JSON.stringify(highlights, null, 2), 'utf8')
  console.log(`📄 Manifest written: ${dest}`)
}

function normalizeMediaRootPath(outputPathTemplate: string) {
  return outputPathTemplate.replace(/\/\{yyyy\}(?:\/\{mm\})?(?:\/.*)?$/, '')
}

export function buildHighlightSegments(
  orderedMediaPaths: string[],
  selectedImagePaths: string[]
): HighlightSegment[] {
  const selectedImages = new Set(selectedImagePaths)
  const segments: HighlightSegment[] = []

  for (const mediaPath of orderedMediaPaths) {
    if (isVideoPath(mediaPath)) {
      segments.push({ path: mediaPath, type: 'video' })
      continue
    }

    if (isImagePath(mediaPath) && selectedImages.has(mediaPath)) {
      segments.push({ path: mediaPath, type: 'image' })
    }
  }

  return segments
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
  console.log('🔍 Scanning media...')
  const resolvedMetaOutputPath = resolveOutputPath(config.nas.metaOutputPath)
  const resolvedOutputPath = resolveOutputPath(config.nas.outputPath)
  prepareMetaOutputPath(resolvedMetaOutputPath)
  prepareOutputPath(resolvedOutputPath)

  const groups = await groupImages(inputListPath)
  console.log(`📁 Found ${groups.size} groups`)

  let generated = 0
  const highlights: PipelineRunSummary['highlights'] = []

  for (const [key, mediaPaths] of groups) {
    if (mediaPaths.length < config.processing.minImagesToGenerate) {
      console.log(`⏭  Skipping ${key} (only ${mediaPaths.length} media files, min: ${config.processing.minImagesToGenerate})`)
      continue
    }

    const imagePaths = mediaPaths.filter(isImagePath)
    const videoPaths = mediaPaths.filter(isVideoPath)

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

    console.log(`\n🎬 Processing: ${key} (${imagePaths.length} images, ${videoPaths.length} videos)`)

    const bestImages = imagePaths.length > 0
      ? await pickBestShots(imagePaths, config.processing.imagesPerHighlight)
      : []
    console.log(`  Selected ${bestImages.length} best shots`)

    const segments = buildHighlightSegments(mediaPaths, bestImages)
    console.log(`  Added ${videoPaths.length} videos, ${segments.length} total segments`)

    await generateHighlight(segments, outputPath)

    highlightDb.upsert(key, outputPath, bestImages.length)
    highlights.push({
      groupKey: key,
      outputPath,
      imageCount: bestImages.length,
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
