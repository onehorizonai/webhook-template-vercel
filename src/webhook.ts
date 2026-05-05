import { emptyResponse, hasJsonContentType, jsonResponse, MAX_WEBHOOK_BODY_BYTES, readHeader } from './http.js'
import { createMemoryEventStore, type WebhookEventStore } from './idempotency.js'
import { hasValidWebhookKey } from './security.js'
import type { HeaderMap, OneHorizonWebhookEvent, WebhookLog, WebhookResponse } from './types.js'

export type WebhookEnv = Record<string, string | undefined>
type RawWebhookBody = string | ArrayBuffer | Uint8Array

export interface WebhookRequest {
  method: string
  headers: HeaderMap
  body?: unknown
  rawBody?: RawWebhookBody
  env?: WebhookEnv
  eventStore?: WebhookEventStore
  log?: WebhookLog
}

const encoder = new TextEncoder()
const defaultLog: WebhookLog = console
const defaultEventStore = createMemoryEventStore()

export async function handleWebhook(request: WebhookRequest): Promise<WebhookResponse> {
  const env = request.env ?? process.env
  const log = request.log ?? defaultLog
  const eventStore = request.eventStore ?? defaultEventStore
  const method = request.method.toUpperCase()

  if (!(await hasValidWebhookKey(readHeader(request.headers, 'x-one-webhook-key'), env.ONE_WEBHOOK_KEY))) {
    log.warn('Rejected One Horizon webhook because the verification key did not match')
    return jsonResponse(401, { error: 'invalid One Horizon webhook key' })
  }

  if (method === 'HEAD' || method === 'GET') {
    return emptyResponse()
  }

  if (method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed for this webhook endpoint' })
  }

  if (!hasJsonContentType(request.headers)) {
    return jsonResponse(415, { error: 'send this webhook as application/json' })
  }

  const parsed = parseBody(request)
  if (!parsed.ok) {
    return jsonResponse(parsed.status, { error: parsed.error })
  }

  const validated = parseWebhookEvent(parsed.value)
  if (!validated.ok) {
    return jsonResponse(400, { error: validated.error })
  }

  const event = validated.event
  const headerEventId = readHeader(request.headers, 'x-one-event-id')
  const headerEventType = readHeader(request.headers, 'x-one-event-type')
  const eventId = headerEventId || event.id
  const eventType = headerEventType || event.type

  try {
    if (await eventStore.has(eventId)) {
      log.info('Accepted duplicate One Horizon webhook without reprocessing it', {
        id: eventId,
        type: eventType
      })
      return jsonResponse(200, {
        ok: true,
        duplicate: true,
        id: eventId,
        type: eventType
      })
    }

    await eventStore.remember(eventId)
  } catch (error) {
    log.error('Failed to record One Horizon webhook idempotency state', {
      id: eventId,
      type: eventType,
      error: error instanceof Error ? error.message : String(error)
    })
    return jsonResponse(500, { error: 'failed to record webhook idempotency state' })
  }

  log.info('Accepted One Horizon webhook', {
    id: eventId,
    type: eventType,
    schema: event.schema,
    workspaceId: event.workspace_id,
    resource: event.resource,
    actor: event.actor,
    retryNum: readHeader(request.headers, 'x-one-retry-num'),
    retryReason: readHeader(request.headers, 'x-one-retry-reason')
  })

  return jsonResponse(200, {
    ok: true,
    id: eventId,
    type: eventType,
    resource: event.resource
  })
}

function parseBody(request: WebhookRequest): { ok: true; value: unknown } | { ok: false; status: number; error: string } {
  if (request.body !== undefined) {
    const estimatedBytes = byteLength(JSON.stringify(request.body))
    if (estimatedBytes > MAX_WEBHOOK_BODY_BYTES) {
      return { ok: false, status: 413, error: 'webhook payload is too large' }
    }
    return { ok: true, value: request.body }
  }

  const raw = request.rawBody
  if (raw === undefined || byteLength(raw) === 0) {
    return { ok: false, status: 400, error: 'webhook payload is required' }
  }

  if (byteLength(raw) > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, error: 'webhook payload is too large' }
  }

  try {
    return { ok: true, value: JSON.parse(bodyToText(raw)) }
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON payload' }
  }
}

function parseWebhookEvent(value: unknown): { ok: true; event: OneHorizonWebhookEvent } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: 'webhook payload must be a JSON object' }
  }

  const requiredFields = ['id', 'type', 'schema', 'workspace_id', 'created_at'] as const
  const missing = requiredFields.find((field) => typeof value[field] !== 'string' || value[field].trim() === '')

  if (missing) {
    return { ok: false, error: `webhook payload is missing ${missing}` }
  }

  if (value.schema !== 'one.webhook.event.v1') {
    return { ok: false, error: 'unsupported One Horizon webhook schema' }
  }

  return { ok: true, event: value as unknown as OneHorizonWebhookEvent }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function byteLength(value: RawWebhookBody | string): number {
  if (typeof value === 'string') {
    return encoder.encode(value).byteLength
  }

  return value.byteLength
}

function bodyToText(value: RawWebhookBody): string {
  if (typeof value === 'string') {
    return value
  }

  return new TextDecoder().decode(value)
}
