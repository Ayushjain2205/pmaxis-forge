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
  category?: string
}

export type Category = {
  slug: string
  name: string
}

export type FeedKind = 'top' | 'breaking' | 'resolving' | 'trending'

export type CatalogScope =
  | { kind: 'all' }
  | { kind: 'feed'; id: FeedKind }
  | { kind: 'category'; slug: string }
  | { kind: 'search'; q: string }

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

export async function pmaxis<T>(path: string, signal?: AbortSignal): Promise<T> {
  const signals = [AbortSignal.timeout(8_000)]
  if (signal) signals.push(signal)
  const res = await fetch(`/forge/pmaxis${path}`, { signal: AbortSignal.any(signals) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `pmaxis ${res.status}`)
  }
  return (await res.json()) as T
}

export const CORE_CATEGORIES: Category[] = [
  { slug: 'sports', name: 'Sports' },
  { slug: 'weather', name: 'Weather' },
  { slug: 'politics', name: 'Politics' },
  { slug: 'crypto', name: 'Crypto' },
  { slug: 'economics', name: 'Economics' },
  { slug: 'science', name: 'Science' },
  { slug: 'pop-culture', name: 'Culture' },
  { slug: 'tech', name: 'Tech' },
]

export function mergeCategories(api: Category[]): Category[] {
  const bySlug = new Map<string, Category>()
  for (const row of CORE_CATEGORIES) bySlug.set(row.slug, row)
  for (const row of api) {
    const slug = row.slug.trim().toLowerCase()
    if (!slug) continue
    if (!bySlug.has(slug)) bySlug.set(slug, { slug, name: row.name || slug })
  }
  return [...bySlug.values()]
}

export function askPrompt(m: Market): string {
  const id = marketId(m)
  const title = marketTitle(m)
  return `Research market ${id}: "${title}". Pull the live price, orderbook, and liquidity. Is the book real, and what would move this price?`
}

const catalogCache = new Map<string, { at: number; rows: Market[] }>()
const CATALOG_TTL_MS = 20_000

export function catalogPath(scope: CatalogScope): string {
  if (scope.kind === 'search') {
    return `/v1/markets/search?q=${encodeURIComponent(scope.q)}&limit=40`
  }
  if (scope.kind === 'all') {
    return `/v1/markets?limit=40&active=true`
  }
  if (scope.kind === 'category') {
    return `/v1/markets?limit=40&category=${encodeURIComponent(scope.slug)}&active=true`
  }
  return `/v1/markets/${scope.id}?limit=40`
}

export function peekCatalog(scope: CatalogScope): Market[] | null {
  return catalogCache.get(catalogPath(scope))?.rows ?? null
}

export async function fetchCatalog(scope: CatalogScope, signal?: AbortSignal): Promise<Market[]> {
  const path = catalogPath(scope)
  const hit = catalogCache.get(path)
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.rows
  try {
    const rows = asList(await pmaxis(path, signal))
    catalogCache.set(path, { at: Date.now(), rows })
    return rows
  } catch (error) {
    if (signal?.aborted) throw error
    if (hit) return hit.rows
    throw error
  }
}

export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  try {
    return mergeCategories(asCategories(await pmaxis('/v1/categories', signal)))
  } catch (error) {
    if (signal?.aborted) throw error
    return CORE_CATEGORIES
  }
}

function asCategories(data: unknown): Category[] {
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).categories ??
        (data as Record<string, unknown>).items ??
        (data as Record<string, unknown>).data)
      : []
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (typeof row === 'string') return { slug: row, name: row }
      if (!row || typeof row !== 'object') return { slug: '', name: '' }
      const rec = row as Record<string, unknown>
      const slug = String(rec.slug ?? rec.id ?? rec.name ?? '')
      const name = String(rec.name ?? rec.title ?? rec.label ?? slug)
      return { slug, name }
    })
    .filter((c) => c.slug)
}

export async function fetchMarket(id: string, signal?: AbortSignal): Promise<Market> {
  return pmaxis(`/v1/markets/${encodeURIComponent(id)}`, signal)
}

export async function fetchOrderbook(id: string, signal?: AbortSignal): Promise<Orderbook> {
  const data = await pmaxis<unknown>(`/v1/markets/${encodeURIComponent(id)}/orderbook`, signal)
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

export async function fetchStats(
  id: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  try {
    return await pmaxis(`/v1/markets/${encodeURIComponent(id)}/stats`, signal)
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
