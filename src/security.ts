const encoder = new TextEncoder()

export async function hasValidWebhookKey(provided: string | undefined, expected: string | undefined): Promise<boolean> {
  const expectedKey = expected?.trim()
  if (!expectedKey) {
    return true
  }

  const providedKey = provided?.trim()
  if (!providedKey) {
    return false
  }

  return timingSafeStringEqual(providedKey, expectedKey)
}

async function timingSafeStringEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)])
  let diff = leftHash.length ^ rightHash.length
  const length = Math.max(leftHash.length, rightHash.length)

  for (let index = 0; index < length; index += 1) {
    diff |= (leftHash[index] ?? 0) ^ (rightHash[index] ?? 0)
  }

  return diff === 0
}

async function sha256(value: string): Promise<Uint8Array> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value))
  return new Uint8Array(hash)
}
