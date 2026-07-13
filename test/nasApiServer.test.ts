import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import os from 'os'
import path from 'path'
import {
  addDeletedKey,
  createHighlightApiHandler,
  parseHighlightDeleteGroupKey,
  removeHighlightFromManifest,
} from '../nas/api/server'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeMetaDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nas-photo-highlight-api-'))
  tempDirs.push(dir)
  return dir
}

describe('parseHighlightDeleteGroupKey', () => {
  it('/api/highlights/:group_key から group_key を取り出す', () => {
    expect(parseHighlightDeleteGroupKey('/api/highlights/2026-03-21')).toBe(
      '2026-03-21'
    )
  })

  it('末尾スラッシュも許容する', () => {
    expect(parseHighlightDeleteGroupKey('/api/highlights/2026-03-21/')).toBe(
      '2026-03-21'
    )
  })

  it('週単位グループキー（YYYY-MM-wN）も取り出せる', () => {
    expect(parseHighlightDeleteGroupKey('/api/highlights/2026-04-w1')).toBe(
      '2026-04-w1'
    )
  })

  it('パスが一致しなければ null を返す', () => {
    expect(parseHighlightDeleteGroupKey('/highlights.json')).toBeNull()
    expect(parseHighlightDeleteGroupKey('/api/highlights/')).toBeNull()
  })
})

describe('addDeletedKey', () => {
  it('未登録のキーを追加する', () => {
    expect(addDeletedKey([], '2026-03-21')).toEqual(['2026-03-21'])
  })

  it('既に登録済みのキーは重複追加しない（冪等）', () => {
    expect(addDeletedKey(['2026-03-21'], '2026-03-21')).toEqual([
      '2026-03-21',
    ])
  })
})

describe('removeHighlightFromManifest', () => {
  it('該当する group_key のエントリを除去する', () => {
    const manifest = [{ group_key: 'a' }, { group_key: 'b' }]
    expect(removeHighlightFromManifest(manifest, 'a')).toEqual([
      { group_key: 'b' },
    ])
  })

  it('該当が無ければそのまま返す', () => {
    const manifest = [{ group_key: 'a' }]
    expect(removeHighlightFromManifest(manifest, 'z')).toEqual(manifest)
  })
})

describe('createHighlightApiHandler', () => {
  it('DELETE で対象を deleted-keys.json に追記し highlights.json から除去する', async () => {
    const metaDir = makeMetaDir()
    writeFileSync(
      path.join(metaDir, 'highlights.json'),
      JSON.stringify([
        { group_key: '2026-03-21' },
        { group_key: '2026-03-22' },
      ])
    )
    const handler = createHighlightApiHandler(metaDir)

    const response = await handler(
      new Request('http://localhost:8899/api/highlights/2026-03-21', {
        method: 'DELETE',
      })
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ group_key: '2026-03-21', deleted: true })

    const manifest = JSON.parse(
      readFileSync(path.join(metaDir, 'highlights.json'), 'utf8')
    )
    expect(manifest).toEqual([{ group_key: '2026-03-22' }])

    const deletedKeys = JSON.parse(
      readFileSync(path.join(metaDir, 'deleted-keys.json'), 'utf8')
    )
    expect(deletedKeys).toEqual(['2026-03-21'])
  })

  it('同じキーを2回削除しても deleted-keys.json は重複しない（冪等）', async () => {
    const metaDir = makeMetaDir()
    writeFileSync(
      path.join(metaDir, 'highlights.json'),
      JSON.stringify([{ group_key: '2026-03-21' }])
    )
    const handler = createHighlightApiHandler(metaDir)

    await handler(
      new Request('http://localhost:8899/api/highlights/2026-03-21', {
        method: 'DELETE',
      })
    )
    await handler(
      new Request('http://localhost:8899/api/highlights/2026-03-21', {
        method: 'DELETE',
      })
    )

    const deletedKeys = JSON.parse(
      readFileSync(path.join(metaDir, 'deleted-keys.json'), 'utf8')
    )
    expect(deletedKeys).toEqual(['2026-03-21'])
  })

  it('highlights.json に存在しないキーを削除しても deleted-keys.json には追記される', async () => {
    const metaDir = makeMetaDir()
    writeFileSync(
      path.join(metaDir, 'highlights.json'),
      JSON.stringify([{ group_key: '2026-03-22' }])
    )
    const handler = createHighlightApiHandler(metaDir)

    const response = await handler(
      new Request('http://localhost:8899/api/highlights/not-in-manifest', {
        method: 'DELETE',
      })
    )

    expect(response.status).toBe(200)
    const deletedKeys = JSON.parse(
      readFileSync(path.join(metaDir, 'deleted-keys.json'), 'utf8')
    )
    expect(deletedKeys).toEqual(['not-in-manifest'])
  })

  it('DELETE 以外のメソッドは 405 を返す', async () => {
    const metaDir = makeMetaDir()
    const handler = createHighlightApiHandler(metaDir)

    const response = await handler(
      new Request('http://localhost:8899/api/highlights/2026-03-21', {
        method: 'GET',
      })
    )

    expect(response.status).toBe(405)
  })

  it('パスが不正なら 404 を返す', async () => {
    const metaDir = makeMetaDir()
    const handler = createHighlightApiHandler(metaDir)

    const response = await handler(
      new Request('http://localhost:8899/api/highlights/', {
        method: 'DELETE',
      })
    )

    expect(response.status).toBe(404)
  })
})
