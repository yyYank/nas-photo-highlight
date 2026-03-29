import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

export interface NasDeployConfig {
  localPhotoPath: string
  localMetaOutputPath: string
  localMediaOutputPath: string
  deployHost: string
  deployDir: string
  deployMetaPath: string
  deployMediaPath: string
  deployPort: number
  deployDockerBin: string
}

function requiredEnv(
  env: Record<string, string | undefined>,
  key: string
): string {
  const value = env[key]?.trim()
  if (!value) {
    throw new Error(`NAS deploy config is missing: ${key}`)
  }
  return value
}

export function normalizeDeployMediaPath(deployMediaPath: string): string {
  return deployMediaPath.replace(/\/\{yyyy\}(?:\/\{mm\})?(?:\/.*)?$/, '')
}

export function buildNasDeployConfig(
  env: Record<string, string | undefined>
): NasDeployConfig {
  return {
    localPhotoPath: requiredEnv(env, 'NAS_PHOTO_PATH'),
    localMetaOutputPath: requiredEnv(env, 'NAS_META_OUTPUT_PATH'),
    localMediaOutputPath: requiredEnv(env, 'NAS_OUTPUT_PATH'),
    deployHost: requiredEnv(env, 'NAS_DEPLOY_HOST'),
    deployDir: requiredEnv(env, 'NAS_DEPLOY_DIR'),
    deployMetaPath: requiredEnv(env, 'NAS_DEPLOY_META_PATH'),
    deployMediaPath: normalizeDeployMediaPath(
      requiredEnv(env, 'NAS_DEPLOY_MEDIA_PATH')
    ),
    deployPort: Number(env.NAS_DEPLOY_PORT ?? '8888'),
    deployDockerBin: env.NAS_DEPLOY_DOCKER_BIN?.trim() || 'docker',
  }
}

export function renderNasNginxConf(): string {
  return `server {
    listen 80;

    root /usr/share/nginx/meta;
    index index.html;

    location = /highlights.json {
        add_header Cache-Control "no-cache";
        add_header Access-Control-Allow-Origin "*";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /media/ {
        alias /usr/share/nginx/media/;
        add_header Accept-Ranges bytes;
        add_header Cache-Control "public, max-age=86400";
        try_files $uri =404;
    }
}
`
}

export function renderNasDockerCompose(config: NasDeployConfig): string {
  return `services:
  web:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "${config.deployPort}:80"
    volumes:
      - ${config.deployMetaPath}:/usr/share/nginx/meta:ro
      - ${config.deployMediaPath}:/usr/share/nginx/media:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
`
}

export function buildRemoteDeployCommands(config: NasDeployConfig) {
  const remoteComposePath = path.posix.join(
    config.deployDir,
    'docker-compose.yml'
  )

  return {
    mkdirArgs: [config.deployHost, 'mkdir', '-p', config.deployDir],
    scpArgs: [
      '-O',
      path.posix.join('nas', 'generated', 'docker-compose.yml'),
      path.posix.join('nas', 'generated', 'nginx.conf'),
      `${config.deployHost}:${config.deployDir}/`,
    ],
    composeArgs: [
      config.deployHost,
      config.deployDockerBin,
      'compose',
      '-f',
      remoteComposePath,
      'up',
      '-d',
    ],
  }
}

export function writeNasDeployFiles(
  config: NasDeployConfig,
  outputDir = path.join('nas', 'generated')
) {
  mkdirSync(outputDir, { recursive: true })

  const dockerComposePath = path.join(outputDir, 'docker-compose.yml')
  const nginxConfPath = path.join(outputDir, 'nginx.conf')

  writeFileSync(dockerComposePath, renderNasDockerCompose(config), 'utf8')
  writeFileSync(nginxConfPath, renderNasNginxConf(), 'utf8')

  return {
    dockerComposePath,
    nginxConfPath,
  }
}

async function runCommand(command: string, args: string[]) {
  const proc = Bun.spawn([command, ...args], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${exitCode}`
    )
  }
}

export async function deployNas(config: NasDeployConfig) {
  writeNasDeployFiles(config)
  const commands = buildRemoteDeployCommands(config)

  await runCommand('ssh', commands.mkdirArgs)
  await runCommand('scp', commands.scpArgs)
  await runCommand('ssh', commands.composeArgs)
}

const args = process.argv.slice(2)

if (import.meta.main) {
  const config = buildNasDeployConfig(process.env)
  writeNasDeployFiles(config)

  if (args.includes('--write-only')) {
    console.log(
      'Generated nas/generated/docker-compose.yml and nas/generated/nginx.conf'
    )
    process.exit(0)
  }

  if (args.includes('--dry-run')) {
    const commands = buildRemoteDeployCommands(config)
    console.log(
      'Generated nas/generated/docker-compose.yml and nas/generated/nginx.conf'
    )
    console.log(`ssh ${commands.mkdirArgs.join(' ')}`)
    console.log(`scp ${commands.scpArgs.join(' ')}`)
    console.log(`ssh ${commands.composeArgs.join(' ')}`)
    process.exit(0)
  }

  await deployNas(config)
  console.log(
    `Deployed NAS web config to ${config.deployHost}:${config.deployDir}`
  )
}
