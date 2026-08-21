export async function rpc<T>(method: string, payload: unknown = {}): Promise<T> {
  const rpcId = crypto.randomUUID()
  const res = await fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method,
      payload,
    }),
  })
  if (!res.ok) {
    throw new Error(`${method} HTTP ${res.status}`)
  }
  const body = (await res.json()) as {
    result: { ok: true; value: T } | { ok: false; error: { message: string; code?: string } }
  }
  if (!body.result.ok) {
    throw new Error(body.result.error.message || method)
  }
  return body.result.value
}

export async function respond(rpcId: string, value: unknown) {
  await fetch('/api/respond', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-response',
      rpcId,
      result: { ok: true, value },
    }),
  })
}
