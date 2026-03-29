import ffmpeg from 'fluent-ffmpeg'
import { config } from '../config'

const HIGHLIGHT_WIDTH = 1080
const HIGHLIGHT_HEIGHT = 1920
const HIGHLIGHT_FPS = 30

export interface HighlightSegment {
  path: string
  type: 'image' | 'video'
}

export function buildHighlightVideoFilters(secondsPerImage: number): string[] {
  return [
    // Keep the full image visible and scale it as large as possible inside the portrait frame.
    `scale=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    // Ken Burns: slow zoom in, reset each image (d=framerate*duration)
    `zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.001))':d=${secondsPerImage * HIGHLIGHT_FPS}:s=${HIGHLIGHT_WIDTH}x${HIGHLIGHT_HEIGHT}:fps=${HIGHLIGHT_FPS}`,
  ]
}

export function buildHighlightFilterGraph(
  segments: HighlightSegment[],
  secondsPerImage: number
): string[] {
  const filters = segments.map((segment, index) => {
    if (segment.type === 'image') {
      return `[${index}:v]scale=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,zoompan=z='if(lte(zoom,1.0),1.15,max(1.001,zoom-0.001))':d=${secondsPerImage * HIGHLIGHT_FPS}:s=${HIGHLIGHT_WIDTH}x${HIGHLIGHT_HEIGHT}:fps=${HIGHLIGHT_FPS},setsar=1[v${index}]`
    }

    return `[${index}:v]scale=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${HIGHLIGHT_WIDTH}:${HIGHLIGHT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${HIGHLIGHT_FPS},setsar=1[v${index}]`
  })

  const concatInputs = segments.map((_, index) => `[v${index}]`).join('')
  filters.push(`${concatInputs}concat=n=${segments.length}:v=1:a=0[vout]`)

  return filters
}

/**
 * Generate a highlight movie from image/video segments.
 * Images use Ken Burns; videos are inserted at original duration.
 */
export function generateHighlight(
  segments: HighlightSegment[],
  outputPath: string
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let cmd = ffmpeg()

    for (const segment of segments) {
      cmd = cmd.input(segment.path)
      if (segment.type === 'image') {
        cmd = cmd.inputOptions(['-loop 1', `-t ${config.processing.secondsPerImage}`])
      }
    }

    const filterGraph = buildHighlightFilterGraph(segments, config.processing.secondsPerImage)
    const outputOptions = [
      '-map [vout]',
      '-pix_fmt yuv420p',
      '-movflags +faststart',
      `-r ${HIGHLIGHT_FPS}`,
    ]

    if (config.bgmPath) {
      const bgmInputIndex = segments.length
      cmd = cmd
        .input(config.bgmPath)
        .audioCodec('aac')
        .audioBitrate('192k')
      outputOptions.push(`-map ${bgmInputIndex}:a:0`, '-shortest')
    } else {
      outputOptions.push('-an')
    }

    cmd
      .complexFilter(filterGraph)
      .videoCodec('libx264')
      .outputOptions(outputOptions)
      .output(outputPath)
      .on('start', (cmdLine) => console.log(`  ffmpeg: ${cmdLine}`))
      .on('progress', (p) => {
        if (p.percent) process.stdout.write(`\r  encoding: ${Math.round(p.percent)}%`)
      })
      .on('end', async () => {
        console.log(`\n  ✅ saved: ${outputPath}`)
        resolve()
      })
      .on('error', async (err) => {
        reject(err)
      })
      .run()
  })
}
