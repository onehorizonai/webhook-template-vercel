import type { HeaderMap, WebhookResponse } from './types.js'

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
}

export function jsonResponse(status: number, body: unknown): WebhookResponse {
  return { status, headers: jsonHeaders, body }
}

export function emptyResponse(status = 204): WebhookResponse {
  return {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  }
}

export function readHeader(headers: HeaderMap, name: string): string | undefined {
  if (hasHeaderGetter(headers)) {
    return headers.get(name) ?? undefined
  }

  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name)
  const value = key ? headers[key] : undefined
  return Array.isArray(value) ? value[0] : value
}

export function hasCloudEventsJsonContentType(headers: HeaderMap): boolean {
  const contentType = readHeader(headers, 'content-type')?.toLowerCase() ?? ''
  return contentType.split(';', 1)[0]?.trim() === 'application/cloudevents+json'
}

function hasHeaderGetter(headers: HeaderMap): headers is { get: (name: string) => string | null } {
  return typeof (headers as { get?: unknown }).get === 'function'
}
