import sharp from 'sharp'

const LAPLACIAN_KERNEL = {
  width: 3,
  height: 3,
  kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
}

export async function calculateLaplacianVariance(
  imagePath: string
): Promise<number> {
  const { data } = await sharp(imagePath)
    .grayscale()
    .convolve(LAPLACIAN_KERNEL)
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (data.length === 0) return 0

  let sum = 0
  for (const value of data) sum += value
  const mean = sum / data.length

  let varianceSum = 0
  for (const value of data) {
    const diff = value - mean
    varianceSum += diff * diff
  }

  return varianceSum / data.length
}
