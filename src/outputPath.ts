import { mkdirSync } from 'fs'
import { syncViewerAssets } from './viewerAssets.js'

interface PrepareOutputPathOptions {
  mkdir?: (path: string) => void
  syncAssets?: (path: string) => void
}

function explainOutputPathError(outputPath: string, error: NodeJS.ErrnoException): Error {
  if (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'ENOENT') {
    return new Error(
      `NAS_OUTPUT_PATH "${outputPath}" を準備できませんでした。NAS が未マウントか、書き込み権限がありません。`
    )
  }

  return error
}

export function prepareOutputPath(
  outputPath: string,
  { mkdir = (target) => mkdirSync(target, { recursive: true }), syncAssets = syncViewerAssets }: PrepareOutputPathOptions = {}
) {
  try {
    mkdir(outputPath)
    syncAssets(outputPath)
  } catch (error) {
    throw explainOutputPathError(outputPath, error as NodeJS.ErrnoException)
  }
}
