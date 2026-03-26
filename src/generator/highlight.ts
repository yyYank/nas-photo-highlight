import ffmpeg from 'fluent-ffmpeg'
import { writeFile, unlink } from 'fs/promises'
import { config } from '../config.js'

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
      .videoFilters([
        // Letterbox to 1920x1080
        'scale=1920:1080:force_original_aspect_ratio=decrease',
        'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
        // Ken Burns: slow zoom in, reset each image (d=framerate*duration)
        `zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.001))':d=${config.processing.secondsPerImage * 30}:s=1920x1080:fps=30`,
      ])
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        '-r 30',
      ])

    if (config.bgmPath) {
      cmd = cmd
        .input(config.bgmPath)
        .audioCodec('aac')
        .audioBitrate('192k')
        .shortest()
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
