export interface WebhookEventStore {
  has: (eventId: string) => boolean | Promise<boolean>
  remember: (eventId: string) => void | Promise<void>
}

export function createMemoryEventStore(maxEvents = 1000): WebhookEventStore {
  const seen = new Set<string>()
  const order: string[] = []

  return {
    has(eventId) {
      return seen.has(eventId)
    },
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
