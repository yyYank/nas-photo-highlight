import { describe, expect, it } from 'bun:test'
import {
  buildFrameExtractionArgs,
  parseShowinfoLine,
} from '../src/infra/ffmpeg'

describe('buildFrameExtractionArgs', () => {
  it('fps 抽出用の ffmpeg 引数を組み立てる', () => {
    expect(
      buildFrameExtractionArgs({
        fps: 4,
        inputPath: '/tmp/input.mp4',
        outputDir: '/tmp/out',
      })
    ).toEqual([
      '-hide_banner',
      '-loglevel',
      'info',
      '-i',
      '/tmp/input.mp4',
      '-vf',
      'fps=4,scale=640:-1:force_original_aspect_ratio=decrease,showinfo',
      '-vsync',
      'vfr',
      '/tmp/out/frame-%06d.jpg',
    ])
  })
})

describe('parseShowinfoLine', () => {
  it('showinfo 行から pts_time を読む', () => {
    expect(
      parseShowinfoLine(
        '[Parsed_showinfo_0 @ 0x0] n:   1 pts: 3000 pts_time:0.750'
      )
    ).toEqual({
      time: 0.75,
      sceneChange: 0,
    })
  })
})
