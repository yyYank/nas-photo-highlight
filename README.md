# 📸 synology-photo-highlight

Synology NAS 上の写真からハイライト動画を自動生成します。  
ローカルの Mac / PC 上で動作し、SMB マウント経由で NAS の写真を読み込み、生成したハイライト `.mp4` を NAS に書き戻します。  
生成済みハイライトを一覧表示して再生できる、シンプルな LAN 向け Web UI も含まれています。

---

## 特徴

- **ベストショット選定** — `sharp` を使ってシャープネスと明るさを評価
- **ハイライト動画生成** — `ffmpeg` による Ken Burns ズームと任意の BGM に対応
- **日付単位またはフォルダ単位でグループ化** — EXIF ベースの日付、またはフォルダ単位で処理
- **LAN 向け Web ビューア** — ホバーでプレビュー、クリックでフルスクリーン再生
- **定期実行** — cron ベースで自動実行（デフォルト: 毎日午前 2 時）
- **既処理データをスキップ** — SQLite で生成済み内容を管理

---

## 必要環境

- [Bun](https://bun.sh) v1.x
- ローカルに [ffmpeg](https://ffmpeg.org) をインストール済みであること（`brew install ffmpeg`）
- Synology NAS を SMB 経由でマウントしていること（Finder → サーバへ接続）

---

## セットアップ

```bash
# 1. クローン
git clone https://github.com/yyYank/synology-photo-highlight.git
cd synology-photo-highlight

# 2. 依存関係をインストール
bun install

# 3. 動作確認
bun test
bun run lint

# 4. 設定
cp .env.example .env
# .env に NAS のマウントパスを設定

# 5. NAS をマウント（Mac の例）
# Finder → 移動 → サーバへ接続 → smb://your-nas-ip
# or: open smb://your-nas-ip
```

---

## 使い方

```bash
# すぐにパイプラインを実行（新しいグループをすべて処理）
bun src/index.ts --run-now

# すべて強制再生成（既処理を無視）
bun src/index.ts --run-now --force

# サーバ起動 + 定期実行パイプライン
bun src/index.ts

# フォルダ単位でスコアリングをテスト
bun src/scorer/imageScore.ts /path/to/photos
```

Web UI は `http://localhost:3000`（またはこのマシンの LAN IP）で利用できます。

---

## プロジェクト構成

```
src/
├── index.ts          # エントリーポイント（サーバ + スケジューラ）
├── config.ts         # 環境変数設定
├── pipeline.ts       # メインのオーケストレーション
├── scanner/
│   └── grouper.ts    # NAS を走査し、画像を日付/フォルダでグループ化
├── scorer/
│   └── imageScore.ts # シャープネス + 明るさのスコアリング
├── generator/
│   └── highlight.ts  # ffmpeg によるハイライト動画生成
├── db/
│   └── index.ts      # SQLite（生成済みハイライトを追跡）
├── server.ts         # ローカル Web UI の静的配信
└── web/
    └── index.html    # LAN ビューア UI
```

---

## `.env` の設定項目

| Key | Default | 説明 |
|---|---|---|
| `NAS_PHOTO_PATH` | — | マウント済み NAS 上の写真ディレクトリ |
| `NAS_OUTPUT_PATH` | — | ハイライト `.mp4` の出力先パス |
| `GROUP_BY` | `date` | `date` または `folder` |
| `IMAGES_PER_HIGHLIGHT` | `25` | 1 ハイライトあたりの最大ベストショット数 |
| `SECONDS_PER_IMAGE` | `3` | 画像 1 枚あたりの表示秒数 |
| `MIN_IMAGES_TO_GENERATE` | `5` | これ未満のグループは生成をスキップ |
| `BGM_PATH` | _(empty)_ | `.mp3` の絶対パス。空なら無効 |
| `PORT` | `3000` | Web UI のポート番号 |
| `CRON_SCHEDULE` | `0 2 * * *` | 自動実行のタイミング |

---

## ライセンス

MIT
