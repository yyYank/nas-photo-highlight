import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

/**
 * NAS 側で動く「非表示」削除 API。
 * highlights.json から即時に該当エントリを取り除きつつ、group_key を
 * deleted-keys.json に記録する。実体の .mp4/.jpg は一切消さない。
 * Mac 側パイプラインは deleted-keys.json を読んで、次回の highlights.json
 * 再生成時にも同じキーを除外する（復活防止）。
 */

export interface ManifestHighlight {
  group_key: string
  [key: string]: unknown
}

const HIGHLIGHT_DELETE_PATH_PATTERN = /^\/api\/highlights\/([^/]+)\/?$/

export function parseHighlightDeleteGroupKey(pathname: string): string | null {
  const match = HIGHLIGHT_DELETE_PATH_PATTERN.exec(pathname)
  if (!match) {
    return null
  }
  return decodeURIComponent(match[1])
}

export function addDeletedKey(existingKeys: string[], key: string): string[] {
  if (existingKeys.includes(key)) {
    return existingKeys
  }
  return [...existingKeys, key]
}

export function removeHighlightFromManifest<T extends { group_key: string }>(
  manifest: T[],
  key: string
): T[] {
  return manifest.filter((highlight) => highlight.group_key !== key)
}

interface JsonArrayIo {
  readFile: (target: string) => string
  exists: (target: string) => boolean
}

function readJsonArray<T>(filePath: string, { readFile, exists }: JsonArrayIo): T[] {
  if (!exists(filePath)) {
    return []
  }
  try {
    const parsed = JSON.parse(readFile(filePath))
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export interface DeleteHighlightDeps {
  metaDir: string
  readFile?: (target: string) => string
  writeFile?: (target: string, content: string) => void
  exists?: (target: string) => boolean
}

export interface DeleteHighlightResult {
  deleted: boolean
}

/**
 * deleted-keys.json への冪等な追記と highlights.json からの即時除去を行う。
 * fs アクセスは DI 可能にして、テストでは実ファイルシステムに触れずに検証する。
 */
export function deleteHighlight(
  groupKey: string,
  {
    metaDir,
    readFile = (target) => readFileSync(target, 'utf8'),
    writeFile = (target, content) => writeFileSync(target, content, 'utf8'),
    exists = existsSync,
  }: DeleteHighlightDeps
): DeleteHighlightResult {
  const deletedKeysPath = path.join(metaDir, 'deleted-keys.json')
  const manifestPath = path.join(metaDir, 'highlights.json')
  const io = { readFile, exists }

  const deletedKeys = readJsonArray<string>(deletedKeysPath, io)
  const alreadyDeleted = deletedKeys.includes(groupKey)
  writeFile(
    deletedKeysPath,
    JSON.stringify(addDeletedKey(deletedKeys, groupKey), null, 2)
  )

  const manifest = readJsonArray<ManifestHighlight>(manifestPath, io)
  const existedInManifest = manifest.some((h) => h.group_key === groupKey)
  writeFile(
    manifestPath,
    JSON.stringify(removeHighlightFromManifest(manifest, groupKey), null, 2)
  )

  return { deleted: alreadyDeleted || existedInManifest }
}

export function createHighlightApiHandler(metaDir: string) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    if (request.method !== 'DELETE') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const groupKey = parseHighlightDeleteGroupKey(url.pathname)
    if (!groupKey) {
      return new Response('Not Found', { status: 404 })
    }

    const result = deleteHighlight(groupKey, { metaDir })
    return Response.json({ group_key: groupKey, deleted: result.deleted })
  }
}

if (import.meta.main) {
  const metaDir = process.env.META_DIR ?? '/meta'
  const port = Number(process.env.PORT ?? 8899)
  const handler = createHighlightApiHandler(metaDir)

  Bun.serve({ port, fetch: handler })
  console.log(`Highlight delete API listening on :${port} (META_DIR=${metaDir})`)
}
