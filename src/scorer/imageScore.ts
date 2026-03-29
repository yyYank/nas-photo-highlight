import sharp from 'sharp'
import path from 'path'

export interface ImageScore {
  path: string
  sharpness: number
  brightnessScore: number
  total: number
}

/**
 * Score a single image.
 * - sharpness: stddev of the grayscale channel — higher = more edges = sharper
 * - brightnessScore: penalizes images that are too dark or blown out
 */
export async function scoreImage(imagePath: string): Promise<ImageScore> {
  const image = sharp(imagePath).grayscale()
  const { channels } = await image.stats()
  const { mean, stdev } = channels[0]

  const sharpness = stdev
  const brightnessScore = 1.0 - Math.abs(mean - 127) / 127

  return {
    path: imagePath,
    sharpness,
    brightnessScore,
    total: sharpness * 0.7 + brightnessScore * 100 * 0.3,
  }
}

/**
 * Pick the top `limit` best shots from a list of image paths.
 */
export async function pickBestShots(
  imagePaths: string[],
  limit: number = 25
): Promise<string[]> {
  const scores = await Promise.all(imagePaths.map(scoreImage))
  return scores
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((s) => s.path)
}

// CLI test: bun src/scorer/imageScore.ts /path/to/folder
if (import.meta.main) {
  const folder = process.argv[2]
  if (!folder) {
    console.error('Usage: bun src/scorer/imageScore.ts <folder>')
    process.exit(1)
  }
  const { readdirSync } = await import('fs')
  const exts = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp'])
  const files = readdirSync(folder)
    .filter((f) => exts.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(folder, f))

  console.log(`Scoring ${files.length} images...`)
  const scores = await Promise.all(files.map(scoreImage))
  scores.sort((a, b) => b.total - a.total).slice(0, 10).forEach((s) => {
    console.log(`[${s.total.toFixed(1)}] ${path.basename(s.path)}`)
  })
}
