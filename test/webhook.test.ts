import { WebhookEventToJSON } from '@onehorizon/sdk-js'
import { describe, expect, it, vi } from 'vitest'
import type { WebhookEvent } from '@onehorizon/sdk-js'
import vercelWebhook from '../api/webhook.js'
import { createMemoryEventStore, handleWebhookRequest, type WebhookOptions } from '../src/webhook.js'

const payload = WebhookEventToJSON({
  specversion: '1.0',
  id: 'evt_123',
  type: 'task.created',
  source: 'onehorizon/workspaces/w_123',
  time: new Date('2026-05-05T12:00:00Z'),
  datacontenttype: 'application/json',
  subject: 'tsk_123',
  workspaceid: 'w_123',
  data: {
    resource: { type: 'task', id: 'tsk_123', workspaceId: 'w_123' },
    actor: { type: 'user', id: 'usr_123' },
    task: {
      taskId: 'tsk_123',
      workspaceId: 'w_123',
      title: 'Review launch checklist',
      status: 'planned',
      visibility: 'team'
    }
  }
} satisfies WebhookEvent)

const cloudEventsHeaders = { 'content-type': 'application/cloudevents+json; charset=utf-8' }
const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

interface SendWebhookOptions {
  method?: string
  headers?: HeadersInit
  body?: unknown
  env?: WebhookOptions['env']
  eventStore?: WebhookOptions['eventStore']
}

async function sendWebhook(options: SendWebhookOptions = {}) {
  const method = options.method ?? 'POST'
  const body = options.body === undefined ? undefined : serialize(options.body)

  return handleWebhookRequest(
    new Request('https://example.com/webhook', {
      method,
      headers: options.headers ?? cloudEventsHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : body
    }),
    {
      env: options.env,
      eventStore: options.eventStore ?? createMemoryEventStore(),
      log
    }
  )
}

function serialize(body: unknown): BodyInit {
  return typeof body === 'string' ? body : JSON.stringify(body)
}

describe('handleWebhookRequest', () => {
  it('uses the flattened One Horizon webhook payload shape', () => {
    expect(payload.data.task).toMatchObject({ taskId: 'tsk_123' })
    expect(payload.data.task?.task).toBeUndefined()
  })

  it('accepts HEAD verification requests', async () => {
    const response = await sendWebhook({
      method: 'HEAD',
      headers: { 'x-one-webhook-key': 'secret' },
      env: { ONE_WEBHOOK_KEY: 'secret' }
    })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('accepts GET verification requests', async () => {
    const response = await sendWebhook({ method: 'GET', headers: {} })

    expect(response.status).toBe(204)
  })

  it('accepts valid POST JSON', async () => {
    const response = await sendWebhook({
      headers: {
        ...cloudEventsHeaders,
        'x-one-webhook-key': 'secret',
        'x-one-event-id': 'evt_header',
        'x-one-event-type': 'task.created'
      },
      body: payload,
      env: { ONE_WEBHOOK_KEY: 'secret' }
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      id: 'evt_header',
      type: 'task.created'
    })
  })

  it('accepts string request bodies', async () => {
    const response = await sendWebhook({
      body: JSON.stringify({ ...payload, type: 'task.updated' })
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      type: 'task.updated'
    })
  })

  it('rejects invalid verification keys when configured', async () => {
    const response = await sendWebhook({
      headers: { ...cloudEventsHeaders, 'x-one-webhook-key': 'wrong' },
      body: payload,
      env: { ONE_WEBHOOK_KEY: 'secret' }
    })

    expect(response.status).toBe(401)
  })

  it('does not require ONE_API_KEY for the hello world path', async () => {
    const response = await sendWebhook({ body: payload })

    expect(response.status).toBe(200)
  })

  it('rejects invalid JSON', async () => {
    const response = await sendWebhook({ body: '{' })

    expect(response.status).toBe(400)
  })

  it('rejects POST requests without a CloudEvents JSON content type', async () => {
    const response = await sendWebhook({ headers: {}, body: payload })

    expect(response.status).toBe(415)
  })

  it('rejects missing required event fields', async () => {
    const response = await sendWebhook({ body: { ...payload, id: '' } })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: 'webhook payload is missing id' })
  })

  it('rejects unsupported CloudEvents spec versions', async () => {
    const response = await sendWebhook({ body: { ...payload, specversion: '0.3' } })

    expect(response.status).toBe(400)
  })

  it('rejects unsupported CloudEvents data content types', async () => {
    const response = await sendWebhook({ body: { ...payload, datacontenttype: 'text/plain' } })

    expect(response.status).toBe(400)
  })

  it('rejects oversized payloads', async () => {
    const response = await sendWebhook({ body: { ...payload, data: 'x'.repeat(300 * 1024) } })

    expect(response.status).toBe(413)
  })

  it('accepts duplicate events without reprocessing', async () => {
    const eventStore = createMemoryEventStore()
    const first = await sendWebhook({ body: payload, eventStore })
    const second = await sendWebhook({ body: payload, eventStore })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    await expect(second.json()).resolves.toMatchObject({ duplicate: true })
  })

  it('returns a retryable error when the idempotency store fails', async () => {
    const response = await sendWebhook({
      body: payload,
      eventStore: {
        has: () => {
          throw new Error('store unavailable')
        },
        save: () => undefined
      }
    })

    expect(response.status).toBe(500)
  })
})

describe('Vercel webhook adapter', () => {
  it('reads raw CloudEvents JSON request bodies', async () => {
    const response = await vercelWebhook.fetch(
      new Request('https://example.com/webhook', {
        method: 'POST',
        headers: cloudEventsHeaders,
        body: JSON.stringify(payload)
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      id: 'evt_123',
      type: 'task.created'
    })
  })
})
