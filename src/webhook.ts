import { WebhookEventFromJSON } from '@onehorizon/sdk-js'
import type { WebhookEvent } from '@onehorizon/sdk-js'

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024

export type WebhookEnv = Record<string, string | undefined>

export interface WebhookOptions {
  env?: WebhookEnv
  eventStore?: WebhookEventStore
  log?: Pick<Console, 'info' | 'warn' | 'error'>
}

export interface WebhookEventStore {
  has: (eventId: string) => boolean | Promise<boolean>
  save: (eventId: string) => void | Promise<void>
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const defaultEventStore = createMemoryEventStore()

export async function handleWebhookRequest(request: Request, options: WebhookOptions = {}): Promise<Response> {
  const env = options.env ?? runtimeEnv()
  const eventStore = options.eventStore ?? defaultEventStore
  const log = options.log ?? console
  const method = request.method.toUpperCase()

  // Set ONE_WEBHOOK_KEY in production so only One Horizon can call this endpoint.
  if (!(await hasValidWebhookKey(request.headers.get('x-one-webhook-key'), env.ONE_WEBHOOK_KEY))) {
    log.warn('Rejected One Horizon webhook because the verification key did not match')
    return json(401, { error: 'invalid One Horizon webhook key' })
  }

  // One Horizon uses GET and HEAD to check that the endpoint exists before sending events.
  if (method === 'HEAD' || method === 'GET') {
    log.info('Verified One Horizon webhook endpoint', { method })
    return new Response(null, { status: 204, headers: safeHeaders })
  }

  if (method !== 'POST') {
    log.warn('Rejected One Horizon webhook because the HTTP method is not supported', { method })
    return json(405, { error: 'method not allowed for this webhook endpoint' })
  }

  // One Horizon sends webhook deliveries as CloudEvents JSON.
  if (!isCloudEventsJson(request.headers.get('content-type'))) {
    log.warn('Rejected One Horizon webhook because the content type is not CloudEvents JSON', {
      contentType: request.headers.get('content-type')
    })
    return json(415, { error: 'send this webhook as application/cloudevents+json' })
  }

  const parsedBody = await readJson(request)
  if (!parsedBody.ok) {
    log.warn('Rejected One Horizon webhook because the payload could not be parsed', parsedBody)
    return json(parsedBody.status, { error: parsedBody.error })
  }

  const parsedEvent = parseWebhookEvent(parsedBody.value)
  if (!parsedEvent.ok) {
    log.warn('Rejected One Horizon webhook because the payload shape is invalid', { error: parsedEvent.error })
    return json(400, { error: parsedEvent.error })
  }

  const event = parsedEvent.event
  const id = request.headers.get('x-one-event-id') || event.id
  const type = request.headers.get('x-one-event-type') || event.type

  // Useful while testing. Remove this before production because payloads can contain workspace data.
  log.info(`Received One Horizon webhook payload:\n${JSON.stringify(event, null, 2)}`)

  try {
    if (await eventStore.has(id)) {
      log.info('Accepted duplicate One Horizon webhook without reprocessing it', { id, type })
      return json(200, { ok: true, duplicate: true, id, type })
    }

    // Store event IDs before side effects. Use Redis, Postgres, or your app DB in production.
    await eventStore.save(id)
  } catch (error) {
    log.error('Failed to record One Horizon webhook idempotency state', {
      id,
      type,
      error: error instanceof Error ? error.message : String(error)
    })
    return json(500, { error: 'failed to record webhook idempotency state' })
  }

  // Keep the webhook fast. Queue slow work here instead of doing it before the 2xx response.
  log.info('Accepted One Horizon webhook', {
    id,
    type,
    workspaceId: event.workspaceid,
    resource: event.data.resource,
    actor: event.data.actor,
    retryNum: request.headers.get('x-one-retry-num'),
    retryReason: request.headers.get('x-one-retry-reason')
  })

  return json(200, { ok: true, id, type, resource: event.data.resource })
}

export function createMemoryEventStore(maxEvents = 1000): WebhookEventStore {
  const seen = new Set<string>()
  const order: string[] = []

  return {
    has: (eventId) => seen.has(eventId),
    save(eventId) {
      if (seen.has(eventId)) {
        return
      }

      seen.add(eventId)
      order.push(eventId)

      while (order.length > maxEvents) {
        const oldest = order.shift()
        if (oldest) {
          seen.delete(oldest)
        }
      }
    }
  }
}

const safeHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: safeHeaders
  })
}

async function readJson(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  const body = new Uint8Array(await request.arrayBuffer())

  if (body.byteLength === 0) {
    return { ok: false, status: 400, error: 'webhook payload is required' }
  }

  if (body.byteLength > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, error: 'webhook payload is too large' }
  }

  try {
    return { ok: true, value: JSON.parse(decoder.decode(body)) }
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON payload' }
  }
}

function parseWebhookEvent(value: unknown): { ok: true; event: WebhookEvent } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: 'webhook payload must be a JSON object' }
  }

  const requiredFields = ['specversion', 'id', 'type', 'source', 'time', 'datacontenttype', 'workspaceid'] as const
  const missing = requiredFields.find((field) => typeof value[field] !== 'string' || value[field].trim() === '')

  if (missing) {
    return { ok: false, error: `webhook payload is missing ${missing}` }
  }

  if (value.specversion !== '1.0') {
    return { ok: false, error: 'unsupported CloudEvents specversion' }
  }

  if (value.datacontenttype !== 'application/json') {
    return { ok: false, error: 'unsupported CloudEvents datacontenttype' }
  }

  if (!isRecord(value.data)) {
    return { ok: false, error: 'webhook payload is missing data' }
  }

  if (!isRecord(value.data.resource)) {
    return { ok: false, error: 'webhook payload is missing data.resource' }
  }

  return { ok: true, event: WebhookEventFromJSON(value) }
}

function isCloudEventsJson(contentType: string | null): boolean {
  return contentType?.toLowerCase().split(';', 1)[0]?.trim() === 'application/cloudevents+json'
}

async function hasValidWebhookKey(provided: string | null, expected: string | undefined): Promise<boolean> {
  const expectedKey = expected?.trim()
  if (!expectedKey) {
    return true
  }

  const providedKey = provided?.trim()
  return providedKey ? timingSafeEqual(providedKey, expectedKey) : false
}

async function timingSafeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)])
  let diff = 0

  for (let index = 0; index < leftHash.length; index += 1) {
    diff |= leftHash[index]! ^ rightHash[index]!
  }

  return diff === 0
}

async function sha256(value: string): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return new Uint8Array(hash)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function runtimeEnv(): WebhookEnv {
  return (globalThis as { process?: { env?: WebhookEnv } }).process?.env ?? {}
}
