import { handleWebhook } from '../src/webhook.js'

export default {
  async fetch(request: Request): Promise<Response> {
    const rawBody = request.method.toUpperCase() === 'POST' ? await readRawBody(request) : undefined

    console.log('Received One Horizon webhook request', {
      method: request.method,
      contentType: request.headers.get('content-type') ?? undefined,
      eventId: request.headers.get('x-one-event-id') ?? undefined,
      eventType: request.headers.get('x-one-event-type') ?? undefined,
      hasRawBody: rawBody !== undefined
    })

    const result = await handleWebhook({
      method: request.method,
      headers: request.headers,
      rawBody
    })

    if (result.status >= 400) {
      console.warn('Rejected One Horizon webhook request', {
        status: result.status,
        response: result.body
      })
    }

    if (request.method === 'HEAD' || result.body === undefined) {
      return new Response(undefined, {
        status: result.status,
        headers: result.headers
      })
    }

    return Response.json(result.body, {
      status: result.status,
      headers: result.headers
    })
  }
}

async function readRawBody(request: Request): Promise<string | undefined> {
  const body = await request.text()
  return body.length > 0 ? body : undefined
}
