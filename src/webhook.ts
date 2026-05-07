import { WebhookEventFromJSON } from '@onehorizon/sdk-js'
import type { WebhookEvent } from '@onehorizon/sdk-js'

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024

export type HeaderMap = Headers | Record<string, string | string[] | undefined>
export type RawWebhookBody = string | ArrayBuffer | Uint8Array
export type WebhookEnv = Record<string, string | undefined>

export interface WebhookRequest {
  method: string
  headers: HeaderMap
  body?: unknown
  rawBody?: RawWebhookBody
  env?: WebhookEnv
  eventStore?: WebhookEventStore
  log?: WebhookLog
}

export interface WebhookResponse {
  status: number
  headers: Record<string, string>
  body?: unknown
}

export interface WebhookLog {
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}

export interface WebhookEventStore {
  has: (eventId: string) => boolean | Promise<boolean>
  remember: (eventId: string) => void | Promise<void>
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const defaultLog: WebhookLog = console
const defaultEventStore = createMemoryEventStore()

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
}

const emptyHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
}

export async function handleWebhookRequest(
  request: Request,
  options: Pick<WebhookRequest, 'env' | 'eventStore' | 'log'> = {}
): Promise<Response> {
  const response = await handleWebhook({
    ...options,
    method: request.method,
    headers: request.headers,
    rawBody: request.method.toUpperCase() === 'POST' ? await request.arrayBuffer() : undefined
  })

  return toFetchResponse(response, request.method)
}

export async function handleWebhook(request: WebhookRequest): Promise<WebhookResponse> {
  const env = request.env ?? runtimeEnv()
  const log = request.log ?? defaultLog
  const eventStore = request.eventStore ?? defaultEventStore
  const method = request.method.toUpperCase()

  if (!(await hasValidWebhookKey(readHeader(request.headers, 'x-one-webhook-key'), env.ONE_WEBHOOK_KEY))) {
    log.warn('Rejected One Horizon webhook because the verification key did not match')
    return jsonResponse(401, { error: 'invalid One Horizon webhook key' })
  }

  if (method === 'HEAD' || method === 'GET') {
    log.info('Verified One Horizon webhook endpoint', { method })
    return emptyResponse()
  }

  if (method !== 'POST') {
    log.warn('Rejected One Horizon webhook because the HTTP method is not supported', { method })
    return jsonResponse(405, { error: 'method not allowed for this webhook endpoint' })
  }

  if (!hasCloudEventsJsonContentType(request.headers)) {
    log.warn('Rejected One Horizon webhook because the content type is not CloudEvents JSON', {
      contentType: readHeader(request.headers, 'content-type')
    })
    return jsonResponse(415, { error: 'send this webhook as application/cloudevents+json' })
  }

  const parsed = parseBody(request)
  if (!parsed.ok) {
    log.warn('Rejected One Horizon webhook because the payload could not be parsed', {
      status: parsed.status,
      error: parsed.error
    })
    return jsonResponse(parsed.status, { error: parsed.error })
  }

  const validated = parseWebhookEvent(parsed.value)
  if (!validated.ok) {
    log.warn('Rejected One Horizon webhook because the payload shape is invalid', { error: validated.error })
    return jsonResponse(400, { error: validated.error })
  }

  const event = validated.event
  const eventId = readHeader(request.headers, 'x-one-event-id') || event.id
  const eventType = readHeader(request.headers, 'x-one-event-type') || event.type

  // Demo only: remove this before production because payloads can contain private workspace data.
  log.info('Received One Horizon webhook payload', { event })

  try {
    if (await eventStore.has(eventId)) {
      log.info('Accepted duplicate One Horizon webhook without reprocessing it', { id: eventId, type: eventType })
      return jsonResponse(200, { ok: true, duplicate: true, id: eventId, type: eventType })
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
    source: event.source,
    subject: event.subject,
    workspaceId: event.workspaceid,
    resource: event.data.resource,
    actor: event.data.actor,
    retryNum: readHeader(request.headers, 'x-one-retry-num'),
    retryReason: readHeader(request.headers, 'x-one-retry-reason')
  })

  return jsonResponse(200, {
    ok: true,
    id: eventId,
    type: eventType,
    resource: event.data.resource
  })
}

export function jsonResponse(status: number, body: unknown): WebhookResponse {
  return { status, headers: jsonHeaders, body }
}

export function emptyResponse(status = 204): WebhookResponse {
  return { status, headers: emptyHeaders }
}

export function toFetchResponse(response: WebhookResponse, method = 'GET'): Response {
  const body = method.toUpperCase() === 'HEAD' || response.body === undefined ? null : JSON.stringify(response.body)
  return new Response(body, { status: response.status, headers: response.headers })
}

export function createMemoryEventStore(maxEvents = 1000): WebhookEventStore {
  const seen = new Set<string>()
  const order: string[] = []

  return {
    has: (eventId) => seen.has(eventId),
    remember(eventId) {
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

function parseBody(request: WebhookRequest): { ok: true; value: unknown } | { ok: false; status: number; error: string } {
  if (request.body !== undefined) {
    if (isRawBody(request.body)) {
      return parseRawBody(request.body)
    }

    if (byteLength(JSON.stringify(request.body)) > MAX_WEBHOOK_BODY_BYTES) {
      return { ok: false, status: 413, error: 'webhook payload is too large' }
    }
    return { ok: true, value: request.body }
  }

  const raw = request.rawBody
  if (raw === undefined || byteLength(raw) === 0) {
    return { ok: false, status: 400, error: 'webhook payload is required' }
  }

  return parseRawBody(raw)
}

function parseRawBody(raw: RawWebhookBody): { ok: true; value: unknown } | { ok: false; status: number; error: string } {
  if (byteLength(raw) > MAX_WEBHOOK_BODY_BYTES) {
    return { ok: false, status: 413, error: 'webhook payload is too large' }
  }

  try {
    return { ok: true, value: JSON.parse(bodyToText(raw)) }
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

function readHeader(headers: HeaderMap, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as Headers).get(name) ?? undefined
  }

  const plainHeaders = headers as Record<string, string | string[] | undefined>
  const wanted = name.toLowerCase()
  const key = Object.keys(plainHeaders).find((candidate) => candidate.toLowerCase() === wanted)
  const value = key ? plainHeaders[key] : undefined
  return Array.isArray(value) ? value[0] : value
}

function hasCloudEventsJsonContentType(headers: HeaderMap): boolean {
  const contentType = readHeader(headers, 'content-type')?.toLowerCase() ?? ''
  return contentType.split(';', 1)[0]?.trim() === 'application/cloudevents+json'
}

async function hasValidWebhookKey(provided: string | undefined, expected: string | undefined): Promise<boolean> {
  const expectedKey = expected?.trim()
  if (!expectedKey) {
    return true
  }

  const providedKey = provided?.trim()
  return providedKey ? timingSafeStringEqual(providedKey, expectedKey) : false
}

async function timingSafeStringEqual(left: string, right: string): Promise<boolean> {
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

function isRawBody(value: unknown): value is RawWebhookBody {
  return typeof value === 'string' || value instanceof ArrayBuffer || value instanceof Uint8Array
}

function byteLength(value: RawWebhookBody | string): number {
  return typeof value === 'string' ? encoder.encode(value).byteLength : value.byteLength
}

function bodyToText(value: RawWebhookBody): string {
  return typeof value === 'string' ? value : decoder.decode(value)
}

function runtimeEnv(): WebhookEnv {
  return (globalThis as { process?: { env?: WebhookEnv } }).process?.env ?? {}
}
