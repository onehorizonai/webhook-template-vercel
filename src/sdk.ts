import { Configuration, DocumentsApi } from '@onehorizon/sdk-js'
import type { WebhookEvent } from '@onehorizon/sdk-js'

export async function loadAttachedDocument(event: WebhookEvent, apiKey = process.env.ONE_API_KEY) {
  const taskId = getTaskId(event)

  if (!apiKey || !taskId) {
    return undefined
  }

  const one = new DocumentsApi(new Configuration({ accessToken: apiKey }))
  const { documents } = await one.listDocuments({
    workspaceId: 'current',
    taskId,
    includeContent: true,
    limit: 1
  })

  return documents?.[0]
}

function getTaskId(event: WebhookEvent) {
  const { resource } = event.data

  if (resource.taskId) {
    return resource.taskId
  }

  return resource.type === 'task' ? resource.id || resource.taskIds?.[0] : undefined
}
