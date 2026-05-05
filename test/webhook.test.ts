import { describe, expect, it, vi } from 'vitest'
import { createMemoryEventStore } from '../src/idempotency.js'
import { handleWebhook } from '../src/webhook.js'

const payload = {
  id: 'evt_123',
  type: 'task.created',
  schema: 'one.webhook.event.v1',
  workspace_id: 'w_123',
  created_at: '2026-05-05T12:00:00Z',
  resource: { type: 'task', id: 'tsk_123', workspace_id: 'w_123' },
  actor: { type: 'user', id: 'usr_123' },
  data: {}
}

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}

const jsonHeaders = { 'content-type': 'application/json' }

describe('handleWebhook', () => {
  it('accepts HEAD verification requests', async () => {
    const response = await handleWebhook({
      method: 'HEAD',
      headers: { 'x-one-webhook-key': 'secret' },
      env: { ONE_WEBHOOK_KEY: 'secret' },
      log
    })

    expect(response.status).toBe(204)
    expect(response.body).toBeUndefined()
  })

  it('accepts GET verification requests', async () => {
    const response = await handleWebhook({
      method: 'GET',
      headers: {},
      env: {},
      log
    })

    expect(response.status).toBe(204)
  })

  it('accepts valid POST JSON', async () => {
    const response = await handleWebhook({
      method: 'POST',
      headers: {
        ...jsonHeaders,
        'x-one-webhook-key': 'secret',
        'x-one-event-id': 'evt_header',
        'x-one-event-type': 'task.created'
      },
      rawBody: JSON.stringify(payload),
      env: { ONE_WEBHOOK_KEY: 'secret' },
      eventStore: createMemoryEventStore(),
      log
    })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      ok: true,
      id: 'evt_header',
      type: 'task.created'
    })
  })

  it('rejects invalid verification keys when configured', async () => {
    const response = await handleWebhook({
      method: 'POST',
      headers: { ...jsonHeaders, 'x-one-webhook-key': 'wrong' },
      rawBody: JSON.stringify(payload),
      env: { ONE_WEBHOOK_KEY: 'secret' },
      log
    })

    expect(response.status).toBe(401)
  })

  it('does not require ONE_API_KEY for the hello world path', async () => {
    const response = await handleWebhook({
      method: 'POST',
      headers: jsonHeaders,
      body: payload,
      env: {},
      eventStore: createMemoryEventStore(),
      log
    })

    expect(response.status).toBe(200)
  })

  it('rejects invalid JSON', async () => {
    const response = await handleWebhook({
      method: 'POST',
      headers: jsonHeaders,
      rawBody: '{',
      env: {},
      log
    })

    expect(response.status).toBe(400)
  })

  it('rejects POST requests without a JSON content type', async () => {
    const response = await handleWebhook({
      method: 'POST',
      headers: {},
      rawBody: JSON.stringify(payload),
      env: {},
      log
    })

    expect(response.status).toBe(415)
  })

  it('rejects missing required event fields', async () => {
    const response = await handleWebhook({
      method: 'POST',
      headers: jsonHeaders,
      body: { ...payload, id: '' },
      env: {},
      log
    })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ error: 'webhook payload is missing id' })
  })

  it('rejects unsupported webhook schemas', async () => {
    const response = await handleWebhook({
      method: 'POST',
      headers: jsonHeaders,
      body: { ...payload, schema: 'example.v2' },
      env: {},
      log
    })

    expect(response.status).toBe(400)
  })

  it('rejects oversized payloads', async () => {
    const response = await handleWebhook({
      method: 'POST',
      headers: jsonHeaders,
      rawBody: JSON.stringify({ ...payload, data: 'x'.repeat(300 * 1024) }),
      env: {},
      log
    })

    expect(response.status).toBe(413)
  })

  it('accepts duplicate events without reprocessing', async () => {
    const eventStore = createMemoryEventStore()
    const first = await handleWebhook({
      method: 'POST',
      headers: jsonHeaders,
      body: payload,
      env: {},
      eventStore,
      log
    })
    const second = await handleWebhook({
      method: 'POST',
      headers: jsonHeaders,
      body: payload,
      env: {},
      eventStore,
      log
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body).toMatchObject({ duplicate: true })
  })

  it('returns a retryable error when the idempotency store fails', async () => {
    const response = await handleWebhook({
      method: 'POST',
      headers: jsonHeaders,
      body: payload,
      env: {},
      eventStore: {
        has: () => {
          throw new Error('store unavailable')
        },
        remember: () => undefined
      },
      log
    })

    expect(response.status).toBe(500)
  })
})
