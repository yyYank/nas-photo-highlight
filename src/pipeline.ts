import path from 'path'
import { writeFileSync } from 'fs'
import { groupImages, isImagePath, isVideoPath } from './scanner/grouper'
import { scoreImages } from './scorer/imageScore'
import {
  buildHighlightCommandPreviews,
  generateHighlight,
  type HighlightCommandPreview,
  runHighlightDryRun,
  type HighlightSegment,
} from './generator/highlight'
import { generateHighlightThumbnail } from './generator/thumbnail'
import { highlightDb } from './db/index'
import { config } from './config'
import {
  prepareMetaOutputPath,
  prepareOutputPath,
  resolveOutputPath,
} from './outputPath'
import { saveLastRunSummary, type PipelineRunSummary } from './notify'
import type { HighlightRecord } from './db/index'

/**
 * Write highlights.json to NAS output folder.
 * This is what Nginx (on the NAS) serves as the "API".
 */
export function buildThumbnailOutputPath(outputPath: string) {
  return outputPath.replace(/\.[^.]+$/, '_thumb.jpg')
}

export function buildManifestHighlight(
  highlight: HighlightRecord,
  mediaRootPath: string
) {
  const thumbnailPath = buildThumbnailOutputPath(highlight.output_path)
  return {
    group_key: highlight.group_key,
    filename: path.basename(highlight.output_path),
    relative_path: path
      .relative(mediaRootPath, highlight.output_path)
      .split(path.sep)
      .join('/'),
    thumbnail_relative_path: path
      .relative(mediaRootPath, thumbnailPath)
      .split(path.sep)
      .join('/'),
    image_count: highlight.image_count,
    created_at: highlight.created_at,
  }
}

function normalizeMediaRootPath(outputPathTemplate: string) {
  return outputPathTemplate.replace(/\/\{yyyy\}(?:\/\{mm\})?(?:\/.*)?$/, '')
}

function exportManifest() {
  const metaOutputPath = resolveOutputPath(config.nas.metaOutputPath)
  const mediaRootPath = normalizeMediaRootPath(config.nas.outputPath)
  const highlights = highlightDb
    .list()
    .map((h) => buildManifestHighlight(h, mediaRootPath))
  const dest = path.join(metaOutputPath, 'highlights.json')
  writeFileSync(dest, JSON.stringify(highlights, null, 2), 'utf8')
  console.log(`📄 Manifest written: ${dest}`)
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

export function selectThumbnailSegment(
  orderedMediaPaths: string[],
  selectedImagePaths: string[]
): HighlightSegment | undefined {
  const selectedImages = new Set(selectedImagePaths)

  for (const mediaPath of orderedMediaPaths) {
    if (isImagePath(mediaPath) && selectedImages.has(mediaPath)) {
      return { path: mediaPath, type: 'image' }
    }
  }

  const fallbackPath = orderedMediaPaths.find(
    (mediaPath) => isImagePath(mediaPath) || isVideoPath(mediaPath)
  )
  if (!fallbackPath) {
    return undefined
  }

  return {
    path: fallbackPath,
    type: isVideoPath(fallbackPath) ? 'video' : 'image',
  }
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

interface DryRunHighlightGroup {
  groupKey: string
  imagePaths: string[]
  mediaPaths: string[]
  outputPath: string
  scores: Awaited<ReturnType<typeof scoreImages>>
  segments: HighlightSegment[]
  ffmpegCommands: HighlightCommandPreview[]
  skipped: boolean
  videoPaths: string[]
}

function printDryRunGroup(group: DryRunHighlightGroup) {
  console.log(`\n🧪 Dry run: ${group.groupKey}`)
  console.log(`  Output: ${group.outputPath}`)
  console.log(`  Media (${group.mediaPaths.length}):`)
  group.mediaPaths.forEach((mediaPath) => console.log(`    - ${mediaPath}`))

  console.log(`  Selected images (${group.scores.length} scored):`)
  group.scores.forEach((score) => {
    console.log(
      `    - ${score.total.toFixed(2)} | sharp=${score.sharpness.toFixed(2)} | bright=${score.brightnessScore.toFixed(2)} | ${score.path}`
    )
  })

  console.log(`  Segments (${group.segments.length}):`)
  group.segments.forEach((segment) => {
    console.log(`    - ${segment.type} | ${segment.path}`)
  })

  console.log('  ffmpeg commands:')
  group.ffmpegCommands.forEach((preview) => {
    console.log(`    [${preview.kind}] ${preview.command}`)
  })

  if (group.skipped) {
    console.log('  Result: skipped by existing output')
  } else {
    console.log('  Result: ffmpeg verification passed')
  }
}

export async function runPipeline({
  force = false,
  dryRun = false,
  inputListPath,
}: {
  force?: boolean
  dryRun?: boolean
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
      console.log(
        `⏭  Skipping ${key} (only ${mediaPaths.length} media files, min: ${config.processing.minImagesToGenerate})`
      )
      continue
    }

    const imagePaths = mediaPaths.filter(isImagePath)
    const videoPaths = mediaPaths.filter(isVideoPath)

    const outputPath = path.join(resolvedOutputPath, `${key}_highlight.mp4`)
    const existingHighlight = highlightDb.find(key)

    if (
      shouldSkipHighlightGeneration({
        force,
        existingOutputPath: existingHighlight?.output_path,
        targetOutputPath: outputPath,
      })
    ) {
      console.log(`⏭  Skipping ${key} (already generated)`)
      continue
    }

    console.log(
      `\n🎬 Processing: ${key} (${imagePaths.length} images, ${videoPaths.length} videos)`
    )

    const imageScores =
      imagePaths.length > 0 ? await scoreImages(imagePaths) : []
    const bestImages = imageScores
      .slice()
      .sort((a, b) => b.total - a.total)
      .slice(0, config.processing.imagesPerHighlight)
      .map((score) => score.path)
    console.log(`  Selected ${bestImages.length} best shots`)

    const segments = buildHighlightSegments(mediaPaths, bestImages)
    const thumbnailSegment = selectThumbnailSegment(mediaPaths, bestImages)
    console.log(
      `  Added ${videoPaths.length} videos, ${segments.length} total segments`
    )

    if (dryRun) {
      const previewCommands = await buildHighlightCommandPreviews(
        segments,
        outputPath
      )
      const { commands: ffmpegCommands } = await runHighlightDryRun(
        segments,
        outputPath
      )
      printDryRunGroup({
        ffmpegCommands:
          ffmpegCommands.length > 0 ? ffmpegCommands : previewCommands,
        groupKey: key,
        imagePaths: bestImages,
        mediaPaths,
        outputPath,
        scores: imageScores.slice().sort((a, b) => b.total - a.total),
        segments,
        skipped: false,
        videoPaths,
      })
      continue
    }

    await generateHighlight(segments, outputPath)
    if (thumbnailSegment) {
      await generateHighlightThumbnail(
        thumbnailSegment,
        buildThumbnailOutputPath(outputPath)
      )
    }

    highlightDb.upsert(key, outputPath, bestImages.length)
    highlights.push({
      groupKey: key,
      outputPath,
      imageCount: bestImages.length,
    })
    generated++
  }

  if (dryRun) {
    console.log('\n✅ Dry run complete — no files were written')
    return {
      generated: 0,
      finishedAt: new Date().toISOString(),
      outputPath: resolvedOutputPath,
      highlights: [],
    }
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

  console.log(
    `\n✅ Pipeline complete — ${generated} new highlight(s) generated`
  )
  return summary
}
