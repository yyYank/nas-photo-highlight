import sharp from 'sharp'

async function loadComparableFrame(imagePath: string, width = 160) {
  const { data, info } = await sharp(imagePath)
    .grayscale()
    .resize({ width, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    data,
    height: info.height,
    width: info.width,
  }
}

export async function calculateFrameDiff(
  previousPath: string,
  currentPath: string
): Promise<number> {
  const previous = await loadComparableFrame(previousPath)
  const current = await loadComparableFrame(currentPath)

  const width = Math.min(previous.width, current.width)
  const height = Math.min(previous.height, current.height)

  if (width === 0 || height === 0) return 0

  let diffSum = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const previousIndex = y * previous.width + x
      const currentIndex = y * current.width + x
      diffSum += Math.abs(
        previous.data[previousIndex] - current.data[currentIndex]
      )
    }
  }

  return diffSum / (width * height * 255)
}

export function combineChangeScore({
  expressionDelta = 0,
  frameDiff,
  sceneChange,
}: {
  expressionDelta?: number
  frameDiff: number
  sceneChange: number
}) {
  return frameDiff * 0.5 + sceneChange * 0.3 + expressionDelta * 0.2
}
