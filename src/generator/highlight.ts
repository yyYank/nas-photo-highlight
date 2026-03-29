import ffmpeg from 'fluent-ffmpeg'
import { writeFile, unlink } from 'fs/promises'
import { config } from '../config.js'

const HIGHLIGHT_WIDTH = 1080
const HIGHLIGHT_HEIGHT = 1920
const HIGHLIGHT_FPS = 30

export function buildHighlightVideoFilters(secondsPerImage: number): string[] {
  return [
    // Fill a portrait frame without letterboxing, cropping overflow from the center.
    `scale=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}`,
    // Ken Burns: slow zoom in, reset each image (d=framerate*duration)
    `zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.001))':d=${secondsPerImage * HIGHLIGHT_FPS}:s=${HIGHLIGHT_WIDTH}x${HIGHLIGHT_HEIGHT}:fps=${HIGHLIGHT_FPS}`,
  ]
}

/**
 * Generate a highlight movie from a list of image paths.
 * Applies Ken Burns zoom effect and optional BGM.
 */
export function generateHighlight(
  imagePaths: string[],
  outputPath: string
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Write a concat list file for ffmpeg
    const listPath = `/tmp/concat_${Date.now()}.txt`
    const listContent = imagePaths
      .map((p) => `file '${p.replace(/'/g, "\\'")}'\nduration ${config.processing.secondsPerImage}`)
      .join('\n')
    await writeFile(listPath, listContent, 'utf8')

    let cmd = ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .videoFilters(buildHighlightVideoFilters(config.processing.secondsPerImage))
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        `-r ${HIGHLIGHT_FPS}`,
      ])

    if (config.bgmPath) {
      cmd = cmd
        .input(config.bgmPath)
        .audioCodec('aac')
        .audioBitrate('192k')
        .outputOptions(['-shortest'])
    } else {
      cmd = cmd.noAudio()
    }

    cmd
      .output(outputPath)
      .on('start', (cmdLine) => console.log(`  ffmpeg: ${cmdLine}`))
      .on('progress', (p) => {
        if (p.percent) process.stdout.write(`\r  encoding: ${Math.round(p.percent)}%`)
      })
      .on('end', async () => {
        console.log(`\n  ✅ saved: ${outputPath}`)
        await unlink(listPath).catch(() => {})
        resolve()
      })
      .on('error', async (err) => {
        await unlink(listPath).catch(() => {})
        reject(err)
      })
      .run()
  })
}
