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
    expect(config.localMediaOutputPath).toBe('/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}')
    expect(config.deployHost).toBe('admin@nas.local')
    expect(config.deployDir).toBe('/volume1/docker/nas-photo-highlight')
    expect(config.deployMetaPath).toBe('/volume1/highlights')
    expect(config.deployMediaPath).toBe('/volume1/Photos/PhotoLibrary')
    expect(config.deployPort).toBe(8080)
    expect(config.deployDockerBin).toBe('/usr/local/bin/docker')
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
    expect(normalizeDeployMediaPath('/volume1/Photos/PhotoLibrary/{yyyy}/{mm}')).toBe('/volume1/Photos/PhotoLibrary')
  })

  it('テンプレートがなければそのまま返す', () => {
    expect(normalizeDeployMediaPath('/volume1/Photos/PhotoLibrary')).toBe('/volume1/Photos/PhotoLibrary')
  })
})

describe('renderNasDockerCompose', () => {
  it('NAS 側の bind mount を埋め込んだ compose を生成する', () => {
    const text = renderNasDockerCompose({
      localPhotoPath: '/Volumes/home/Photos/PhotoLibrary',
      localMetaOutputPath: '/Volumes/home/Photos/highlights',
      localMediaOutputPath: '/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}',
      deployHost: 'admin@nas.local',
      deployDir: '/volume1/docker/nas-photo-highlight',
      deployMetaPath: '/volume1/highlights',
      deployMediaPath: '/volume1/Photos/PhotoLibrary',
      deployPort: 8888,
      deployDockerBin: '/usr/local/bin/docker',
    })

    expect(text).toContain('- "8888:80"')
    expect(text).toContain('/volume1/highlights:/usr/share/nginx/meta:ro')
    expect(text).toContain('/volume1/Photos/PhotoLibrary:/usr/share/nginx/media:ro')
    expect(text).toContain('./nginx.conf:/etc/nginx/conf.d/default.conf:ro')
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
})

describe('buildRemoteDeployCommands', () => {
  it('ssh と scp の実行内容を組み立てる', () => {
    const commands = buildRemoteDeployCommands({
      localPhotoPath: '/Volumes/home/Photos/PhotoLibrary',
      localMetaOutputPath: '/Volumes/home/Photos/highlights',
      localMediaOutputPath: '/Volumes/home/Photos/PhotoLibrary/{yyyy}/{mm}',
      deployHost: 'admin@nas.local',
      deployDir: '/volume1/docker/nas-photo-highlight',
      deployMetaPath: '/volume1/highlights',
      deployMediaPath: '/volume1/Photos/PhotoLibrary',
      deployPort: 8888,
      deployDockerBin: '/usr/local/bin/docker',
    })

    expect(commands.mkdirArgs).toEqual(['admin@nas.local', 'mkdir', '-p', '/volume1/docker/nas-photo-highlight'])
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
  })
})
