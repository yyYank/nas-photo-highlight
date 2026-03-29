import { copyFileSync } from 'fs'
import path from 'path'

export function syncViewerAssets(outputPath: string) {
  const sourcePath = path.join(import.meta.dir, 'web', 'index.html')
  const destPath = path.join(outputPath, 'index.html')

  copyFileSync(sourcePath, destPath)
}
