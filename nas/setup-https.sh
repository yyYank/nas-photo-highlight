#!/usr/bin/env bash
set -euo pipefail

# mkcert でローカル CA 発行の証明書を作り、nas/generated/certs/ に配置する。
# `bun run deploy:nas` はここに cert.pem / key.pem がある場合だけ NAS 側の
# nginx に TLS (listen 443 ssl) を追加し、8443 番ポートで公開する。

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="$SCRIPT_DIR/generated/certs"
LAN_IP="${NAS_TLS_HOST:-192.168.50.40}"

if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert が見つかりません。先にインストールしてください:" >&2
  echo "  brew install mkcert" >&2
  echo "  brew install nss   # Firefox でも使う場合のみ" >&2
  exit 1
fi

echo "ローカル CA が未登録の場合は、先に一度だけ実行してください（sudo を求められることがあります）:"
echo "  mkcert -install"
echo

mkdir -p "$CERT_DIR"

mkcert -cert-file "$CERT_DIR/cert.pem" -key-file "$CERT_DIR/key.pem" "$LAN_IP"

echo
echo "証明書を生成しました:"
echo "  $CERT_DIR/cert.pem"
echo "  $CERT_DIR/key.pem"
echo
echo "Android (Chrome) にルートCAを信頼させる手順:"
echo "  1. ローカル CA の保存場所を確認:"
echo "       mkcert -CAROOT"
echo "  2. そのディレクトリ内の rootCA.pem を Android 端末へ転送する"
echo "     （NAS の共有フォルダ経由・メール添付など）"
echo "  3. Android の 設定 > セキュリティ > 暗号化と認証情報 >"
echo "     CA証明書をインストール から rootCA.pem を選択してインストール"
echo "  4. Chrome で https://${LAN_IP}:8443 を開き、鍵アイコンが有効なことを確認"
echo
echo "次のステップ: 'bun run deploy:nas' を実行すると証明書がNASへ転送され、"
echo "8443番ポートでHTTPSが有効になります（'bun run deploy:nas:dry-run' で事前確認可）。"
