import { mkdirSync } from 'fs'
import { syncViewerAssets } from './viewerAssets'

interface PrepareOutputPathOptions {
  mkdir?: (path: string) => void
}

interface PrepareMetaOutputPathOptions extends PrepareOutputPathOptions {
  syncAssets?: (path: string) => void
}

export function resolveOutputPath(outputPathTemplate: string, currentDate: Date = new Date()): string {
  const yyyy = String(currentDate.getFullYear())
  const mm = String(currentDate.getMonth() + 1).padStart(2, '0')

  return outputPathTemplate.replaceAll('{yyyy}', yyyy).replaceAll('{mm}', mm)
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
  { mkdir = (target) => mkdirSync(target, { recursive: true }) }: PrepareOutputPathOptions = {}
) {
  try {
    mkdir(outputPath)
  } catch (error) {
    throw explainOutputPathError(outputPath, error as NodeJS.ErrnoException)
  }
}

export function prepareMetaOutputPath(
  outputPath: string,
  { mkdir = (target) => mkdirSync(target, { recursive: true }), syncAssets = syncViewerAssets }: PrepareMetaOutputPathOptions = {}
) {
  try {
    mkdir(outputPath)
    syncAssets(outputPath)
  } catch (error) {
    throw explainOutputPathError(outputPath, error as NodeJS.ErrnoException)
  }
}
