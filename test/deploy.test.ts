import { describe, expect, it } from 'bun:test'
import {
  buildNasDeployConfig,
  buildRemoteDeployCommands,
  normalizeDeployMediaPath,
  renderNasDockerCompose,
  renderNasNginxConf,
} from '../src/deploy'

describe('buildNasDeployConfig', () => {
  it('必要な環境変数から NAS デプロイ設定を組み立てる', () => {
    const config = buildNasDeployConfig({
      NAS_PHOTO_PATH: '/Volumes/home/Photos/PhotoLibrary',
      NAS_META_OUTPUT_PATH: '/Volumes/home/Photos/highlights',
      NAS_OUTPUT_PATH: '/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}',
      NAS_DEPLOY_HOST: 'admin@nas.local',
      NAS_DEPLOY_DIR: '/volume1/docker/nas-photo-highlight',
      NAS_DEPLOY_META_PATH: '/volume1/highlights',
      NAS_DEPLOY_MEDIA_PATH: '/volume1/Photos/PhotoLibrary/{yyyy}/{mm}',
      NAS_DEPLOY_PORT: '8080',
      NAS_DEPLOY_DOCKER_BIN: '/usr/local/bin/docker',
    })

    expect(config.localPhotoPath).toBe('/Volumes/home/Photos/PhotoLibrary')
    expect(config.localMetaOutputPath).toBe('/Volumes/home/Photos/highlights')
    expect(config.localMediaOutputPath).toBe(
      '/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}'
    )
    expect(config.deployHost).toBe('admin@nas.local')
    expect(config.deployDir).toBe('/volume1/docker/nas-photo-highlight')
    expect(config.deployMetaPath).toBe('/volume1/highlights')
    expect(config.deployMediaPath).toBe('/volume1/Photos/PhotoLibrary')
    expect(config.deployPort).toBe(8080)
    expect(config.deployDockerBin).toBe('/usr/local/bin/docker')
  })

  it('NAS_DEPLOY_TLS_PORT 未指定時は 8443 を使う', () => {
    const config = buildNasDeployConfig({
      NAS_PHOTO_PATH: '/Volumes/home/Photos/PhotoLibrary',
      NAS_META_OUTPUT_PATH: '/Volumes/home/Photos/highlights',
      NAS_OUTPUT_PATH: '/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}',
      NAS_DEPLOY_HOST: 'admin@nas.local',
      NAS_DEPLOY_DIR: '/volume1/docker/nas-photo-highlight',
      NAS_DEPLOY_META_PATH: '/volume1/highlights',
      NAS_DEPLOY_MEDIA_PATH: '/volume1/Photos/PhotoLibrary',
    })

    expect(config.deployTlsPort).toBe(8443)
  })

  it('NAS_DEPLOY_TLS_PORT を指定した場合はそれを使う', () => {
    const config = buildNasDeployConfig({
      NAS_PHOTO_PATH: '/Volumes/home/Photos/PhotoLibrary',
      NAS_META_OUTPUT_PATH: '/Volumes/home/Photos/highlights',
      NAS_OUTPUT_PATH: '/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}',
      NAS_DEPLOY_HOST: 'admin@nas.local',
      NAS_DEPLOY_DIR: '/volume1/docker/nas-photo-highlight',
      NAS_DEPLOY_META_PATH: '/volume1/highlights',
      NAS_DEPLOY_MEDIA_PATH: '/volume1/Photos/PhotoLibrary',
      NAS_DEPLOY_TLS_PORT: '9443',
    })

    expect(config.deployTlsPort).toBe(9443)
  })

  it('必須値が足りない場合は分かりやすく失敗する', () => {
    expect(() =>
      buildNasDeployConfig({
        NAS_PHOTO_PATH: '/Volumes/home/Photos/PhotoLibrary',
      })
    ).toThrow('NAS deploy config is missing:')
  })
})

describe('normalizeDeployMediaPath', () => {
  it('年月テンプレートを bind mount 用のルートへ正規化する', () => {
    expect(
      normalizeDeployMediaPath('/volume1/Photos/PhotoLibrary/{yyyy}/{mm}')
    ).toBe('/volume1/Photos/PhotoLibrary')
  })

  it('テンプレートがなければそのまま返す', () => {
    expect(normalizeDeployMediaPath('/volume1/Photos/PhotoLibrary')).toBe(
      '/volume1/Photos/PhotoLibrary'
    )
  })
})

const baseConfig = {
  localPhotoPath: '/Volumes/home/Photos/PhotoLibrary',
  localMetaOutputPath: '/Volumes/home/Photos/highlights',
  localMediaOutputPath: '/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}',
  deployHost: 'admin@nas.local',
  deployDir: '/volume1/docker/nas-photo-highlight',
  deployMetaPath: '/volume1/highlights',
  deployMediaPath: '/volume1/Photos/PhotoLibrary',
  deployPort: 8888,
  deployTlsPort: 8443,
  deployDockerBin: '/usr/local/bin/docker',
}

describe('renderNasDockerCompose', () => {
  it('NAS 側の bind mount を埋め込んだ compose を生成する', () => {
    const text = renderNasDockerCompose(baseConfig)

    expect(text).toContain('- "8888:80"')
    expect(text).toContain('/volume1/highlights:/usr/share/nginx/meta:ro')
    expect(text).toContain(
      '/volume1/Photos/PhotoLibrary:/usr/share/nginx/media:ro'
    )
    expect(text).toContain('./nginx.conf:/etc/nginx/conf.d/default.conf:ro')
  })

  it('TLS 無効時は 443 公開と certs マウントを含まない', () => {
    const text = renderNasDockerCompose(baseConfig)

    expect(text).not.toContain(':443"')
    expect(text).not.toContain('./certs')
  })

  it('TLS 有効時は 8443:443 公開と certs マウントを追加する（HTTP は維持）', () => {
    const text = renderNasDockerCompose(baseConfig, true)

    expect(text).toContain('- "8888:80"')
    expect(text).toContain('- "8443:443"')
    expect(text).toContain('./certs:/etc/nginx/certs:ro')
  })

  it('削除API (api) サービスを web の depends_on 込みで含む（TLS 有無に関わらず）', () => {
    const withoutTls = renderNasDockerCompose(baseConfig)
    const withTls = renderNasDockerCompose(baseConfig, true)

    for (const text of [withoutTls, withTls]) {
      expect(text).toContain('depends_on:\n      - api')
      expect(text).toContain('image: oven/bun:alpine')
      expect(text).toContain('/volume1/highlights:/meta')
      expect(text).toContain('./api:/app/api:ro')
      expect(text).toContain('command: ["bun", "run", "api/server.ts"]')
    }
  })
})

describe('renderNasNginxConf', () => {
  it('meta と media を分離した nginx 設定を生成する', () => {
    const text = renderNasNginxConf()

    expect(text).toContain('root /usr/share/nginx/meta;')
    expect(text).toContain('location = /highlights.json')
    expect(text).toContain('location /media/')
    expect(text).toContain('alias /usr/share/nginx/media/;')
  })

  it('TLS 無効時は ssl 関連の設定を含まない', () => {
    const text = renderNasNginxConf()

    expect(text).not.toContain('443')
    expect(text).not.toContain('ssl_certificate')
  })

  it('TLS 有効時は listen 443 ssl と証明書パスを追加する（listen 80 も維持）', () => {
    const text = renderNasNginxConf(true)

    expect(text).toContain('listen 80;')
    expect(text).toContain('listen 443 ssl;')
    expect(text).toContain('ssl_certificate /etc/nginx/certs/cert.pem;')
    expect(text).toContain('ssl_certificate_key /etc/nginx/certs/key.pem;')
  })

  it('削除API (/api/) へのリバースプロキシを含む（TLS 有無に関わらず）', () => {
    const withoutTls = renderNasNginxConf()
    const withTls = renderNasNginxConf(true)

    for (const text of [withoutTls, withTls]) {
      expect(text).toContain('location /api/')
      expect(text).toContain('proxy_pass http://api:8899/api/;')
    }
  })
})

describe('buildRemoteDeployCommands', () => {
  it('ssh と scp の実行内容を組み立てる', () => {
    const commands = buildRemoteDeployCommands(baseConfig)

    expect(commands.mkdirArgs).toEqual([
      'admin@nas.local',
      'mkdir',
      '-p',
      '/volume1/docker/nas-photo-highlight',
    ])
    expect(commands.scpArgs).toEqual([
      '-O',
      'nas/generated/docker-compose.yml',
      'nas/generated/nginx.conf',
      'admin@nas.local:/volume1/docker/nas-photo-highlight/',
    ])
    expect(commands.composeArgs).toEqual([
      'admin@nas.local',
      '/usr/local/bin/docker',
      'compose',
      '-f',
      '/volume1/docker/nas-photo-highlight/docker-compose.yml',
      'up',
      '-d',
    ])
    expect(commands.scpCertsArgs).toBeNull()
  })

  it('TLS 有効時は certs ディレクトリ作成と証明書の scp を組み立てる', () => {
    const commands = buildRemoteDeployCommands(baseConfig, true)

    expect(commands.mkdirArgs).toEqual([
      'admin@nas.local',
      'mkdir',
      '-p',
      '/volume1/docker/nas-photo-highlight',
      '/volume1/docker/nas-photo-highlight/certs',
    ])
    expect(commands.scpCertsArgs).toEqual([
      '-O',
      'nas/generated/certs/cert.pem',
      'nas/generated/certs/key.pem',
      'admin@nas.local:/volume1/docker/nas-photo-highlight/certs/',
    ])
  })
})
