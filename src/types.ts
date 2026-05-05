export type HeaderValue = string | string[] | undefined
export type HeaderMap = Record<string, HeaderValue> | { get: (name: string) => string | null }

export interface OneHorizonWebhookResource {
  type: string
  id?: string
  workspace_id?: string
  task_id?: string
  comment_id?: string
  team_id?: string
}

export interface OneHorizonWebhookActor {
  type?: string
  id?: string
}

export interface OneHorizonWebhookEvent {
  id: string
  type: string
  schema: 'one.webhook.event.v1' | string
  workspace_id: string
  created_at: string
  resource?: OneHorizonWebhookResource
  actor?: OneHorizonWebhookActor
  session_id?: string
  trigger?: string
  prompt_context?: string
  agent_session?: Record<string, unknown>
  agent_activity?: Record<string, unknown>
  previous_comments?: Array<Record<string, unknown>>
  guidance?: Array<Record<string, unknown>>
  context?: Record<string, unknown>
  data?: unknown
}

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
