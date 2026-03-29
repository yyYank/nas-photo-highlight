import { Database } from 'bun:sqlite'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data.db')
const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS highlights (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_key   TEXT    NOT NULL UNIQUE,
    output_path TEXT    NOT NULL,
    image_count INTEGER NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`)

export interface HighlightRecord {
  id: number
  group_key: string
  output_path: string
  image_count: number
  created_at: string
  updated_at: string
}

export const highlightDb = {
  upsert(groupKey: string, outputPath: string, imageCount: number) {
    db.query(`
      INSERT INTO highlights (group_key, output_path, image_count)
        VALUES ($groupKey, $outputPath, $imageCount)
      ON CONFLICT(group_key) DO UPDATE SET
        output_path  = excluded.output_path,
        image_count  = excluded.image_count,
        updated_at   = datetime('now')
    `).run({
      $groupKey: groupKey,
      $outputPath: outputPath,
      $imageCount: imageCount,
    })
  },

  exists(groupKey: string): boolean {
    const row = db
      .query('SELECT id FROM highlights WHERE group_key = ?')
      .get(groupKey)
    return !!row
  },

  find(groupKey: string): HighlightRecord | null {
    const row = db
      .query('SELECT * FROM highlights WHERE group_key = ?')
      .get(groupKey)
    return (row as HighlightRecord | null) ?? null
  },

  list(): HighlightRecord[] {
    return db
      .query('SELECT * FROM highlights ORDER BY group_key DESC')
      .all() as HighlightRecord[]
  },
}
