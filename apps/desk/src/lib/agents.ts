import { rpc } from './rpc'

export type AgentPreset = {
  id: string
  name: string
  description: string
  icon: string
  proxyPrefix: string
  envKey: string
  tools: string[]
  systemPrompt: string
  starters: { label: string; text: string }[]
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: 'research',
    name: 'Research',
    description: 'Analyze markets, check orderbooks, track prices.',
    icon: '🔍',
    proxyPrefix: '/forge/pmaxis',
    envKey: 'PMAXIS_API_KEY',
    tools: ['fetch_market', 'orderbook', 'candles', 'deltas', 'search'],
    systemPrompt:
      'You are a prediction market research analyst. You have access to live market data, orderbooks, candlestick charts, and price deltas. Ground every claim in tool results. When you name a market, cite its live price and book depth.',
    starters: [
      { label: 'Morning brief', text: 'What moved in the last hour? Ground prices in tool results.' },
      { label: 'Top volume', text: 'Top markets by volume right now. Check if the book is real.' },
    ],
  },
  {
    id: 'copy-trading',
    name: 'Copy Trading',
    description: 'Track what top traders are doing and mirror their moves.',
    icon: '📋',
    proxyPrefix: '/forge/pmaxis',
    envKey: 'PMAXIS_API_KEY',
    tools: ['fetch_market', 'orderbook', 'traders', 'positions'],
    systemPrompt:
      'You are a copy-trading assistant. You track top traders on prediction markets, analyze their positions, and help the user mirror profitable strategies. Always cite trader identities and their actual positions from tool results.',
    starters: [
      { label: 'Top traders', text: 'Who are the most profitable traders right now? Show their positions.' },
      { label: 'Whale watch', text: 'Any large positions opened in the last hour? Show the traders and their sizes.' },
    ],
  },
  {
    id: 'signals',
    name: 'Signals',
    description: 'Get alerted to breaking events and price anomalies.',
    icon: '⚡',
    proxyPrefix: '/forge/pmaxis',
    envKey: 'PMAXIS_API_KEY',
    tools: ['fetch_market', 'signals', 'alerts', 'deltas'],
    systemPrompt:
      'You are a market signals assistant. You surface breaking events, price anomalies, and actionable alerts from prediction markets. Prioritize speed and specificity — name the market, the move, and the magnitude.',
    starters: [
      { label: 'Breaking', text: 'What just broke? Show any significant price movements in the last hour.' },
      { label: 'Anomalies', text: 'Any unusual volume or price spikes across markets right now?' },
    ],
  },
]

export function getPreset(id: string): AgentPreset | undefined {
  return AGENT_PRESETS.find((p) => p.id === id)
}

export function getDefaultPreset(): AgentPreset {
  return AGENT_PRESETS[0]
}

export async function listSessions(): Promise<
  { sessionId: string; title: string; updatedAt: number; running: boolean; blank: boolean; preset?: string }[]
> {
  const res = await rpc<{ items: Record<string, unknown>[] }>('session.list', {})
  return (res.items ?? [])
    .map((raw) => {
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
      const preset =
        typeof raw.agentPreset === 'string'
          ? raw.agentPreset
          : typeof projections?.values?.agentPreset === 'string'
            ? projections.values.agentPreset
            : undefined
      return {
        sessionId: String(raw.sessionId ?? ''),
        title,
        updatedAt,
        running: Boolean(raw.running),
        blank: Boolean(raw.blank),
        preset,
        origin: typeof raw.origin === 'string' ? raw.origin : undefined,
      }
    })
    .filter((row) => row.sessionId && row.origin !== 'subagent')
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function groupByPreset(sessions: Awaited<ReturnType<typeof listSessions>>) {
  const groups = new Map<string, typeof sessions>()
  for (const s of sessions) {
    const key = s.preset ?? 'research'
    const arr = groups.get(key) ?? []
    arr.push(s)
    groups.set(key, arr)
  }
  return groups
}
