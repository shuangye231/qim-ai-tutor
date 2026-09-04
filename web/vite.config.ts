import { cpSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const webRoot = dirname(fileURLToPath(import.meta.url))
const scratchRuntimeRoot = resolve(webRoot, 'node_modules/@scratch/scratch-gui-standalone/dist')
const scratchStaticRoot = resolve(scratchRuntimeRoot, 'static')

const scratchAssetMiddleware = (req: { url?: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (data: unknown) => void }, next: () => void) => {
  const prefixes = ['/static/', '/web/dist/scratch3/static/']
  const prefix = prefixes.find((candidate) => req.url?.startsWith(candidate))
  if (!prefix) {
    next()
    return
  }
  const relativePath = decodeURIComponent(req.url.slice(prefix.length).split('?')[0])
  const filePath = resolve(scratchStaticRoot, relativePath)
  if (!filePath.startsWith(`${scratchStaticRoot}\\`) || !existsSync(filePath)) {
    next()
    return
  }
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }
  const extension = relativePath.slice(relativePath.lastIndexOf('.')).toLowerCase()
  res.statusCode = 200
  res.setHeader('Content-Type', contentTypes[extension] || 'application/octet-stream')
  res.end(readFileSync(filePath))
}

const copyScratchRuntime = () => ({
  name: 'copy-scratch-runtime',
  configureServer(server: { middlewares: { use: (handler: (req: { url?: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (data: unknown) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use(scratchAssetMiddleware)
    server.middlewares.use((req, res, next) => {
      const prefix = '/web/dist/scratch3/runtime/'
      if (!req.url?.startsWith(prefix)) {
        next()
        return
      }
      const relativePath = decodeURIComponent(req.url.slice(prefix.length).split('?')[0])
      const filePath = resolve(scratchRuntimeRoot, relativePath)
      if (!filePath.startsWith(`${scratchRuntimeRoot}${'\\'}`) || !existsSync(filePath)) {
        next()
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', relativePath.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'application/octet-stream')
      res.end(readFileSync(filePath))
    })
  },
  closeBundle() {
    cpSync(
      scratchRuntimeRoot,
      resolve(webRoot, 'dist/scratch3/runtime'),
      { recursive: true, force: true },
    )
    cpSync(
      resolve(webRoot, 'node_modules/@scratch/scratch-gui-standalone/dist/static'),
      resolve(webRoot, 'dist/scratch3/static'),
      { recursive: true, force: true },
    )
    cpSync(
      resolve(webRoot, 'node_modules/@scratch/scratch-gui-standalone/dist/static'),
      resolve(webRoot, 'dist/static'),
      { recursive: true, force: true },
    )
  },
})

export default defineConfig({
  base: '/web/dist/',
  plugins: [react(), copyScratchRuntime()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:8899',
      '/static': 'http://127.0.0.1:8899',
    },
  },
})
