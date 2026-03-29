export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const rank = clamp(p, 0, 1) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)

  if (lower === upper) return sorted[lower]

  const weight = rank - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

export function normalizeByPercentile(
  values: number[],
  {
    lowerPercentile = 0.1,
    upperPercentile = 0.9,
  }: {
    lowerPercentile?: number
    upperPercentile?: number
  } = {}
): number[] {
  if (values.length === 0) return []

  const low = percentile(values, lowerPercentile)
  const high = percentile(values, upperPercentile)
  const range = high - low

  if (range <= 0) {
    return values.map((value) => value > low ? 1 : 0)
  }

  return values.map((value) => clamp((value - low) / range, 0, 1))
}
