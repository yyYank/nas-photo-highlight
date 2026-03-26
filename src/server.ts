import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { config } from './config.js'

interface StaticHandlerOptions {
  outputPath: string
  uiHtml: string
}

function resolveAssetPath(outputPath: string, pathname: string): string | null {
  const relativePath = pathname.replace(/^\/+/, '')
  const absolutePath = path.resolve(outputPath, relativePath)
  const basePath = path.resolve(outputPath)

  if (!absolutePath.startsWith(`${basePath}${path.sep}`) && absolutePath !== basePath) {
    return null
  }

  return absolutePath
}

export function createStaticHandler({ outputPath, uiHtml }: StaticHandlerOptions) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(uiHtml, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    const assetPath = resolveAssetPath(outputPath, decodeURIComponent(url.pathname))
    if (!assetPath || !existsSync(assetPath)) {
      return new Response('Not Found', { status: 404 })
    }

    return new Response(Bun.file(assetPath))
  }
}

export function startWebServer() {
  const uiPath = path.join(import.meta.dir, 'web', 'index.html')
  const uiHtml = readFileSync(uiPath, 'utf8')
  const handler = createStaticHandler({
    outputPath: config.nas.outputPath,
    uiHtml,
  })

  return Bun.serve({
    port: config.port,
    fetch: handler,
  })
}
