import { readFile } from 'node:fs/promises'
import http from 'node:http'
import { handleWebhook } from '../src/webhook.js'
import type { HeaderMap } from '../src/types.js'

await loadDotEnv()

const port = Number(process.env.PORT || 3000)
const indexHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || `localhost:${port}`}`)

    if (url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(indexHtml)
      return
    }

    if (url.pathname !== '/webhook') {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ error: 'not found' }))
      return
    }

    const body = await readRequestBody(request)
    const result = await handleWebhook({
      method: request.method || 'GET',
      headers: request.headers as HeaderMap,
      rawBody: body.byteLength > 0 ? body : undefined
    })

    response.writeHead(result.status, result.headers)
    if (request.method === 'HEAD' || result.body === undefined) {
      response.end()
      return
    }
    response.end(JSON.stringify(result.body))
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  }
})

server.listen(port, () => {
  console.log(`Vercel webhook template running at http://localhost:${port}`)
  console.log('Use / for the status page and /webhook for One Horizon webhooks.')
})

async function readRequestBody(request: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function loadDotEnv(): Promise<void> {
  try {
    const contents = await readFile(new URL('../.env', import.meta.url), 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const separator = trimmed.indexOf('=')
      if (separator === -1) {
        continue
      }

      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim()
      process.env[key] ??= value
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}
