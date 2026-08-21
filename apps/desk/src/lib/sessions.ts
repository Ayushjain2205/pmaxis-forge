import { rpc } from './rpc'

export type SessionRow = {
  sessionId: string
  title: string
  updatedAt: number
  running: boolean
  blank: boolean
  origin?: string
}

export async function listSessions(): Promise<SessionRow[]> {
  const res = await rpc<{ items: Record<string, unknown>[] }>('session.list', {})
  return (res.items ?? [])
    .map(toRow)
    .filter((row) => row.sessionId && row.origin !== 'subagent')
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadHistory(sessionId: string) {
  return rpc<{ events: { event?: Record<string, unknown> }[] }>('session.history', {
    sessionId,
    maxMessages: 80,
  })
}

function toRow(raw: Record<string, unknown>): SessionRow {
  const projections = raw.projections as { values?: Record<string, unknown> } | undefined
  const titleVal = projections?.values?.title ?? raw.title
  const title =
    (typeof titleVal === 'string' && titleVal) ||
    (titleVal && typeof titleVal === 'object' && typeof (titleVal as { text?: unknown }).text === 'string'
      ? (titleVal as { text: string }).text
      : '') ||
    'untitled'
  const meta = projections?.values?.sessionListMetadata as { lastPromptAt?: unknown } | undefined
  const updatedAt = Number(raw.updatedAt ?? meta?.lastPromptAt ?? 0)
  return {
    sessionId: String(raw.sessionId ?? ''),
    title,
    updatedAt,
    running: Boolean(raw.running),
    blank: Boolean(raw.blank),
    origin: typeof raw.origin === 'string' ? raw.origin : undefined,
  }
}

export function formatWhen(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
