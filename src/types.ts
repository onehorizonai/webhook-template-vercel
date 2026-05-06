export type HeaderValue = string | string[] | undefined
export type HeaderMap = Record<string, HeaderValue> | { get: (name: string) => string | null }

export interface OneHorizonWebhookResource {
  type: string
  id?: string
  workspaceId?: string
  taskId?: string
  taskIds?: string[]
  commentId?: string
  teamId?: string
  issueId?: string
  meetingId?: string
  summaryId?: string
  documentId?: string
  workItemId?: string
}

export interface OneHorizonWebhookActor {
  type?: string
  id?: string
}

export interface OneHorizonWebhookEvent {
  specversion: '1.0' | string
  id: string
  type: string
  source: string
  time: string
  datacontenttype: 'application/json' | string
  subject?: string
  workspaceid: string
  data: {
    resource: OneHorizonWebhookResource
    actor?: OneHorizonWebhookActor
    task?: Record<string, unknown>
    comment?: Record<string, unknown>
    commentReaction?: Record<string, unknown>
    team?: Record<string, unknown>
    invite?: Record<string, unknown>
    taxonomy?: Record<string, unknown>
    issue?: Record<string, unknown>
    meeting?: Record<string, unknown>
    summary?: Record<string, unknown>
    document?: Record<string, unknown>
    workItem?: Record<string, unknown>
    taskSnooze?: Record<string, unknown>
  }
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
