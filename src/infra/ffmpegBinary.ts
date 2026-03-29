import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

function isSpawnError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
}

export function buildMissingBinaryError(binaryName: string) {
  return new Error(
    `${binaryName} command is not available. Install ffmpeg and ensure ${binaryName} is on PATH.`
  )
}

export async function assertBinaryAvailable(binaryName: string) {
  try {
    await execFileAsync(binaryName, ['-version'])
  } catch (error) {
    if (isSpawnError(error) && error.code === 'ENOENT') {
      throw buildMissingBinaryError(binaryName)
    }

    throw error
  }
}
