export const config = {
  nas: {
    photoPath: process.env.NAS_PHOTO_PATH ?? '',
    outputPath: process.env.NAS_OUTPUT_PATH ?? '',
  },
  processing: {
    groupBy: (process.env.GROUP_BY ?? 'date') as 'date' | 'folder',
    imagesPerHighlight: Number(process.env.IMAGES_PER_HIGHLIGHT ?? 25),
    secondsPerImage: Number(process.env.SECONDS_PER_IMAGE ?? 3),
    minImagesToGenerate: Number(process.env.MIN_IMAGES_TO_GENERATE ?? 5),
  },
  bgmPath: process.env.BGM_PATH ?? '',
  port: Number(process.env.PORT ?? 8888),
  cronSchedule: process.env.CRON_SCHEDULE ?? '0 2 * * *',
} as const

export function validateConfig() {
  if (!config.nas.photoPath) throw new Error('NAS_PHOTO_PATH is not set in .env')
  if (!config.nas.outputPath) throw new Error('NAS_OUTPUT_PATH is not set in .env')
}
