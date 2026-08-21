export type Market = {
  market_id?: string | number
  id?: string | number
  question?: string
  title?: string
  price?: number
  mid_price?: number
  volume?: number
  volume_24h?: number
  best_bid?: number
  best_ask?: number
  status?: string
  slug?: string
  liquidity?: number
}

export type Orderbook = {
  bids?: { price: number; size: number }[]
  asks?: { price: number; size: number }[]
}

function asList(data: unknown): Market[] {
  if (Array.isArray(data)) return data as Market[]
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>
    for (const key of ['markets', 'items', 'data', 'results']) {
      if (Array.isArray(rec[key])) return rec[key] as Market[]
    }
  }
  return []
}

export function marketId(m: Market): string {
  return String(m.market_id ?? m.id ?? '')
}

export function marketTitle(m: Market): string {
  return m.question || m.title || marketId(m) || 'untitled'
}

export function marketPrice(m: Market): number | undefined {
  const n = m.mid_price ?? m.price
  return typeof n === 'number' ? n : undefined
}

export async function pmaxis<T>(path: string): Promise<T> {
  const res = await fetch(`/forge/pmaxis${path}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `pmaxis ${res.status}`)
  }
  return (await res.json()) as T
}

export async function fetchBoard(kind: 'top' | 'breaking' | 'resolving'): Promise<Market[]> {
  const path =
    kind === 'top'
      ? '/v1/markets/top?limit=20'
      : kind === 'breaking'
        ? '/v1/markets/breaking?limit=20'
        : '/v1/markets/resolving?limit=20'
  return asList(await pmaxis(path))
}

export async function fetchMarket(id: string): Promise<Market> {
  return pmaxis(`/v1/markets/${encodeURIComponent(id)}`)
}

export async function fetchOrderbook(id: string): Promise<Orderbook> {
  const data = await pmaxis<unknown>(`/v1/markets/${encodeURIComponent(id)}/orderbook`)
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>
    const book = (rec.orderbook ?? rec) as Orderbook
    return {
      bids: normalizeLevels(book.bids),
      asks: normalizeLevels(book.asks),
    }
  }
  return { bids: [], asks: [] }
}

export async function fetchStats(id: string): Promise<Record<string, unknown>> {
  try {
    return await pmaxis(`/v1/markets/${encodeURIComponent(id)}/stats`)
  } catch {
    return {}
  }
}

function normalizeLevels(raw: unknown): { price: number; size: number }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (Array.isArray(row) && row.length >= 2) {
        return { price: Number(row[0]), size: Number(row[1]) }
      }
      if (row && typeof row === 'object') {
        const r = row as Record<string, unknown>
        return { price: Number(r.price ?? r.p), size: Number(r.size ?? r.s ?? r.quantity) }
      }
      return { price: NaN, size: NaN }
    })
    .filter((r) => Number.isFinite(r.price) && Number.isFinite(r.size))
    .slice(0, 12)
}

export function formatPx(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '—'
  if (n >= 0.01) return n.toFixed(2)
  return n.toFixed(4)
}

export function formatVol(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return ''
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

export function idsFromToolText(text: string): string[] {
  const ids = new Set<string>()
  const re = /"market_id"\s*:\s*"?(\d+)"?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) ids.add(m[1])
  return [...ids]
}
