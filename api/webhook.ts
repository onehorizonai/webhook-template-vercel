import { handleWebhook } from '../src/webhook.js'

type HeaderValue = string | string[] | undefined

interface VercelRequest {
  method?: string
  headers: Record<string, HeaderValue>
  body?: unknown
}

interface VercelResponse {
  status(code: number): VercelResponse
  setHeader(name: string, value: string): void
  end(): void
  json(body: unknown): void
}

export default async function webhook(request: VercelRequest, response: VercelResponse) {
  const result = await handleWebhook({
    method: request.method || 'GET',
    headers: request.headers,
    body: request.body
  })

  response.status(result.status)
  for (const [name, value] of Object.entries(result.headers)) {
    response.setHeader(name, value)
  }
  if (request.method === 'HEAD' || result.body === undefined) {
    response.end()
    return
  }
  response.json(result.body)
}
