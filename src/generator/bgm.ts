import { readdirSync, statSync } from 'fs'
import path from 'path'

const MP3_EXTENSION = '.mp3'

/**
 * 配列からランダムに1件選ぶ純粋関数。
 * random は 0 以上 1 未満の値を返す関数を注入できる（テストで決定的にするため）。
 */
export function pickRandomItem<T>(
  items: T[],
  random: () => number = Math.random
): T {
  if (items.length === 0) {
    throw new Error('pickRandomItem: items must not be empty')
  }
  const index = Math.floor(random() * items.length)
  const clampedIndex = Math.min(index, items.length - 1)
  return items[clampedIndex] as T
}

/**
 * BGM_PATH からこの動画で使う BGM ファイルパスを解決する。
 * - 空文字列なら undefined（BGM なし）
 * - ファイルを指す場合はそのまま返す（従来互換。存在しないパスもそのまま返し、
 *   ffmpeg 実行時にエラーとする従来の挙動を維持する）
 * - ディレクトリを指す場合は直下の .mp3（大文字小文字問わず）からランダムに1曲選ぶ。
 *   .mp3 が1つも無い場合は警告を出して undefined を返す（BGM なしで続行）。
 */
export function resolveBgmPath(
  bgmPath: string,
  random: () => number = Math.random
): string | undefined {
  if (!bgmPath) return undefined

  let stat
  try {
    stat = statSync(bgmPath)
  } catch {
    return bgmPath
  }

  if (!stat.isDirectory()) {
    return bgmPath
  }

  const mp3Files = readdirSync(bgmPath).filter(
    (entry) => path.extname(entry).toLowerCase() === MP3_EXTENSION
  )

  if (mp3Files.length === 0) {
    console.warn(
      `BGM_PATH のディレクトリに .mp3 が見つかりません（BGM なしで生成します）: ${bgmPath}`
    )
    return undefined
  }

  return path.join(bgmPath, pickRandomItem(mp3Files, random))
}
