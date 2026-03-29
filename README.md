# 📸 nas-photo-highlight

NAS 上の写真や動画からハイライト動画を自動生成します。  
ローカルの Mac / PC 上で動作し、SMB マウント経由で NAS の写真を読み込み、生成したハイライト `.mp4` を NAS に書き戻します。  
生成済みハイライトを一覧表示して再生できる、シンプルな LAN 向け Web UI も含まれています。

---

## 特徴

- **ベストショット選定** — `sharp` を使ってシャープネスと明るさを評価
- **ハイライト動画生成** — `ffmpeg` によるスマホ向け縦動画生成。画像には Ken Burns を適用し、撮影動画は元の尺のまま差し込み
- **日付単位またはフォルダ単位でグループ化** — EXIF ベースの日付、またはフォルダ単位で処理
- **LAN 向け Web ビューア** — ホバーでプレビュー、クリックでフルスクリーン再生
- **定期実行** — cron ベースで自動実行（デフォルト: 毎日午前 2 時）
- **既処理データをスキップ** — SQLite で生成済み内容を管理
- **スコアリング基盤** — `ffmpeg` とローカル処理で動画フレームの focus / change / total を算出
- **表情スコア導入** — ローカルの顔解析結果を読み込み、expression と bonus を加味したスコアリングに対応
- **候補区間化** — 平滑化、ピーク抽出、近接マージを行い、highlight candidate JSON を出力

---

## 必要環境

- [Bun](https://bun.sh) v1.x
- ローカルに [ffmpeg](https://ffmpeg.org) をインストール済みであること（`brew install ffmpeg`）
- NAS を SMB 経由でマウントしていること（Finder → サーバへ接続）

---

## セットアップ

```bash
# 1. クローン
git clone https://github.com/yyYank/nas-photo-highlight.git
cd nas-photo-highlight

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
# 手動でハイライトを生成
bun run generate

# 指定した画像一覧だけでハイライトを生成
bun run generate --input-list /path/to/input-files.txt

# 動画フレームの初期スコアを JSON で確認
bun src/cli/run-highlight.ts /path/to/input.mp4 --fps 4

# ローカルの顔解析結果 JSON を使って expression / bonus も反映
bun src/cli/run-highlight.ts /path/to/input.mp4 --fps 4 --face-analysis /path/to/faces.json

# 直近の生成結果を通知
bun run notify

# 定期実行して Web UI を公開
bun run schedule

# NAS の nginx 設定を生成してデプロイ
bun run deploy:nas:dry-run
bun run deploy:nas

# 既存ハイライトを強制再生成
bun run generate:force
```

Web UI は `http://localhost:8888`（またはこのマシンの LAN IP）で利用できます。

---

## プロジェクト構成

```
src/
├── index.ts          # エントリーポイント（サーバ + スケジューラ）
├── config.ts         # 環境変数設定
├── pipeline.ts       # メインのオーケストレーション
├── scanner/
│   └── grouper.ts    # NAS を走査し、画像・動画を日付/フォルダでグループ化
├── core/             # スコア正規化・集計
├── analyzers/        # focus / change などの analyzer
├── infra/            # ffmpeg など外部ツール連携
├── types/            # scoring 用の型定義
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
| `NAS_META_OUTPUT_PATH` | `NAS_OUTPUT_PATH` | `index.html` / `highlights.json` / `last-run.json` の出力先パス |
| `NAS_OUTPUT_PATH` | — | ハイライト `.mp4` の出力先パス。`{yyyy}` / `{mm}` を利用可能 |
| `GROUP_BY` | `date` | `date` または `folder` |
| `IMAGES_PER_HIGHLIGHT` | `25` | 1 ハイライトあたりの最大ベストショット数 |
| `SECONDS_PER_IMAGE` | `3` | 画像 1 枚あたりの表示秒数 |
| `MIN_IMAGES_TO_GENERATE` | `5` | これ未満のグループは生成をスキップ |
| `BGM_PATH` | _(empty)_ | `.mp3` の絶対パス。空なら無効 |
| `NOTIFY_PROVIDER` | `gmail` | `webhook` または `gmail` |
| `BASE_URL` | _(empty)_ | 通知文に含めるハイライト動画のベース URL |
| `NOTIFY_WEBHOOK_URL` | _(empty)_ | 直近の生成結果を送る webhook URL |
| `GMAIL_FROM` | _(empty)_ | Gmail 通知の送信元アドレス表示 |
| `GMAIL_TO` | _(empty)_ | Gmail 通知の送信先アドレス |
| `GMAIL_USER` | _(empty)_ | Gmail SMTP 認証に使うアカウント |
| `GMAIL_APP_PASSWORD` | _(empty)_ | Gmail SMTP 認証に使うアプリパスワード |
| `PORT` | `8888` | Web UI のポート番号 |
| `NAS_DEPLOY_HOST` | _(empty)_ | NAS へ `ssh` / `scp` する接続先 |
| `NAS_DEPLOY_DIR` | _(empty)_ | NAS 上で `docker-compose.yml` と `nginx.conf` を配置するディレクトリ |
| `NAS_DEPLOY_META_PATH` | _(empty)_ | NAS 上で `index.html` / `highlights.json` / `last-run.json` を読む bind mount 元 |
| `NAS_DEPLOY_MEDIA_PATH` | _(empty)_ | NAS 上で `PhotoLibrary` を読む bind mount 元。`{yyyy}` / `{mm}` を含む場合は配信ルートへ正規化 |
| `NAS_DEPLOY_PORT` | `8888` | NAS 上で公開する HTTP ポート |
| `NAS_DEPLOY_DOCKER_BIN` | `docker` | 非対話 `ssh` で使う Docker CLI パス。Synology では `/usr/local/bin/docker` のことがある |
| `CRON_SCHEDULE` | `0 2 * * *` | 自動実行のタイミング |

## NAS Web Deploy

`bun run deploy:nas` はローカル `.env` を参照して `nas/generated/docker-compose.yml` と `nas/generated/nginx.conf` を生成し、その後 NAS へ `scp` して `docker compose up -d` を実行します。

注意:

- `NAS_PHOTO_PATH` / `NAS_META_OUTPUT_PATH` / `NAS_OUTPUT_PATH` はローカル Mac の SMB マウントパスです
- Docker bind mount には使えないので、NAS 側の実パスは `NAS_DEPLOY_META_PATH` / `NAS_DEPLOY_MEDIA_PATH` で別に指定します
- まず `bun run deploy:nas:dry-run` で実行予定コマンドを確認してください

---

## ライセンス

MIT
