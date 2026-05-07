import type { WebhookEvent } from '@onehorizon/sdk-js'

export type HeaderValue = string | string[] | undefined
export type HeaderMap = Record<string, HeaderValue> | { get: (name: string) => string | null }
export type OneHorizonWebhookEvent = WebhookEvent

export interface WebhookLog {
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>) => void
}

export interface WebhookResponse {
  status: number
  headers: Record<string, string>
  body?: unknown
}
