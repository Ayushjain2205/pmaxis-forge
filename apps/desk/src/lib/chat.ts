export type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'tool'; name: string; args: string; result?: string; ok?: boolean }

export type ChatTurn =
  | { id: string; kind: 'user'; item: Extract<ChatItem, { kind: 'user' }> }
  | { id: string; kind: 'forge'; items: Exclude<ChatItem, { kind: 'user' }>[] }

export function groupTurns(items: ChatItem[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const item of items) {
    if (item.kind === 'user') {
      turns.push({ id: item.id, kind: 'user', item })
      continue
    }
    const last = turns[turns.length - 1]
    if (last?.kind === 'forge') last.items.push(item)
    else turns.push({ id: item.id, kind: 'forge', items: [item] })
  }
  return turns
}

export function toolLabel(name: string): string {
  return name.replace(/^mcp__.+?__/, '')
}

export function extractText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n')
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if (typeof rec.text === 'string') return rec.text
    if (rec.content !== undefined) return extractText(rec.content)
    if (rec.message !== undefined) return extractText(rec.message)
  }
  return ''
}

export function eventType(ev: Record<string, unknown>): string {
  return String(ev.type ?? '')
}

/** Fold a session log into chat items. Skip streaming chunks — history already has the final message. */
export function foldHistory(events: { event?: Record<string, unknown> }[]): ChatItem[] {
  const items: ChatItem[] = []
  const tools = new Map<string, number>()
  for (const entry of events) {
    const ev = (entry.event ?? entry) as Record<string, unknown>
    const type = eventType(ev)
    const data = (ev.data as Record<string, unknown> | undefined) ?? {}
    if (type === 'user/message') {
      const text = extractText(data.message ?? data)
      if (text) items.push({ id: crypto.randomUUID(), kind: 'user', text })
    } else if (type === 'assistant/message') {
      const text = extractText(data.message ?? data)
      if (!text) continue
      const last = items[items.length - 1]
      if (last?.kind === 'assistant') last.text = text
      else items.push({ id: crypto.randomUUID(), kind: 'assistant', text })
    } else if (type === 'tool/call') {
      const name = String(data.name ?? 'tool')
      const args =
        typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments ?? {})
      const callId = String(data.callId ?? crypto.randomUUID())
      tools.set(callId, items.length)
      items.push({ id: callId, kind: 'tool', name, args })
    } else if (type === 'tool/result') {
      const msg = (data.message as Record<string, unknown> | undefined) ?? {}
      const source = (msg.source as Record<string, unknown> | undefined) ?? {}
      const callId = String(source.callId ?? '')
      const text = extractText(msg.content ?? data)
      const ok = !data.error && !/unknown tool|isError/i.test(text)
      const idx = tools.get(callId)
      let item = idx !== undefined ? items[idx] : undefined
      if (!item) {
        for (let i = items.length - 1; i >= 0; i--) {
          const cand = items[i]
          if (cand.kind === 'tool' && cand.result === undefined) {
            item = cand
            break
          }
        }
      }
      if (item?.kind === 'tool') {
        item.result = text
        item.ok = ok
      }
    }
  }
  return items
}
