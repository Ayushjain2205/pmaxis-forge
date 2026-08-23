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
  end_time?: string
  stats_24h?: { price_change_pct?: number; volume_24h?: number }
}

export type MarketDelta = {
  changePct?: number
  volume24h?: number
}

export type Category = {
  slug: string
  name: string
}

export type FeedKind = 'top' | 'breaking' | 'resolving' | 'trending' | 'new'

export type CatalogScope =
  | { kind: 'all' }
  | { kind: 'feed'; id: FeedKind }
  | { kind: 'category'; slug: string }
  | { kind: 'search'; q: string }
  | { kind: 'watching' }
  | { kind: 'events' }
  | { kind: 'event'; id: string; name: string }

export type Orderbook = {
  bids?: { price: number; size: number }[]
  asks?: { price: number; size: number }[]
}

export type MarketEvent = {
  id: string
  title: string
}

export type Print = {
  price: number
  size: number
  side: string
  at?: number
}

export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export type Health = {
  status: string
  detail?: string
}

export type InspectExtras = {
  health: Health | null
  related: Market[]
  trades: Print[]
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

export const BRIEF_PROMPT =
  'Morning brief: what moved in the last hour, the top names by volume, and markets resolving this week. For anything you name, check whether the book is real. Ground every price in a tool result.'

export const STARTERS: { label: string; text: string }[] = [
  { label: 'Morning brief', text: BRIEF_PROMPT },
  {
    label: 'Breaking hour',
    text: 'What broke in the last hour, and is the book real on the names that moved?',
  },
  {
    label: 'Top volume',
    text: 'Top markets by volume right now. Ground prices in tool results.',
  },
  {
    label: 'Resolving soon',
    text: 'Markets resolving this week with the most activity. Is the book real?',
  },
]

const WATCH_KEY = 'forge:watch'

export function loadWatch(): Market[] {
  try {
    const raw = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]') as Market[]
    return Array.isArray(raw) ? raw.filter((m) => marketId(m)) : []
  } catch {
    return []
  }
}

export function isWatched(id: string): boolean {
  return loadWatch().some((m) => marketId(m) === id)
}

export function toggleWatch(market: Market): Market[] {
  const id = marketId(market)
  if (!id) return loadWatch()
  const current = loadWatch()
  const next = current.some((m) => marketId(m) === id)
    ? current.filter((m) => marketId(m) !== id)
    : [{ market_id: id, question: marketTitle(market), price: marketPrice(market) }, ...current].slice(
        0,
        24,
      )
  localStorage.setItem(WATCH_KEY, JSON.stringify(next))
  return next
}

const catalogCache = new Map<string, { at: number; rows: Market[] }>()
const CATALOG_TTL_MS = 20_000

export function catalogPath(scope: CatalogScope): string {
  if (scope.kind === 'search') {
    return `/v1/markets/search?q=${encodeURIComponent(scope.q)}&limit=40&status=ACTIVE`
  }
  if (scope.kind === 'all') {
    return `/v1/markets?limit=40&status=ACTIVE`
  }
  if (scope.kind === 'category') {
    return `/v1/markets?limit=40&category=${encodeURIComponent(scope.slug)}&status=ACTIVE`
  }
  if (scope.kind === 'watching') {
    const ids = loadWatch()
      .map((m) => marketId(m))
      .filter(Boolean)
      .slice(0, 10)
    return ids.length ? `/v1/markets/compare?ids=${ids.join(',')}` : ''
  }
  if (scope.kind === 'events') return '/v1/events?limit=40&active=true'
  if (scope.kind === 'event') {
    return `/v1/events/${encodeURIComponent(scope.id)}/markets?limit=40&status=ACTIVE`
  }
  return `/v1/markets/${scope.id}?limit=40&status=ACTIVE`
}

export function peekCatalog(scope: CatalogScope): Market[] | null {
  return catalogCache.get(catalogPath(scope))?.rows ?? null
}

function activeOnly(rows: Market[]): Market[] {
  return rows.filter((m) => {
    const s = (m.status ?? 'ACTIVE').toUpperCase()
    return s === 'ACTIVE' || s === ''
  })
}

function withoutStatus(path: string): string {
  return path.replace(/([?&])status=ACTIVE&?/, '$1').replace(/[?&]$/, '')
}

export async function fetchCatalog(scope: CatalogScope, signal?: AbortSignal): Promise<Market[]> {
  if (scope.kind === 'events') return []
  const strict = !(scope.kind === 'feed' && scope.id === 'breaking')
  const keep = (rows: Market[]) => (strict ? activeOnly(rows) : rows)
  if (scope.kind === 'watching') {
    const path = catalogPath(scope)
    if (!path) return loadWatch()
    try {
      const rows = keep(asList(await pmaxis(path, signal)))
      return rows.length ? rows : loadWatch()
    } catch (error) {
      if (signal?.aborted) throw error
      return loadWatch()
    }
  }
  const path = catalogPath(scope)
  const hit = catalogCache.get(path)
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.rows
  try {
    let rows: Market[]
    try {
      rows = keep(asList(await pmaxis(path, signal)))
    } catch (error) {
      if (signal?.aborted || !path.includes('status=ACTIVE')) throw error
      const fallback = withoutStatus(path)
      rows = keep(asList(await pmaxis(fallback, signal)))
    }
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

export async function fetchEvents(signal?: AbortSignal): Promise<MarketEvent[]> {
  try {
    return asEvents(await pmaxis('/v1/events?limit=40&active=true', signal))
  } catch (error) {
    if (signal?.aborted) throw error
    return []
  }
}

export async function fetchCompare(ids: string[], signal?: AbortSignal): Promise<Market[]> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 10)
  if (unique.length < 2) return []
  return asList(await pmaxis(`/v1/markets/compare?ids=${unique.join(',')}`, signal))
}

export async function fetchInspectExtras(
  id: string,
  signal?: AbortSignal,
): Promise<InspectExtras> {
  const jobs = await Promise.allSettled([
    pmaxis<unknown>(`/v1/markets/${encodeURIComponent(id)}/health`, signal),
    pmaxis<unknown>(`/v1/markets/${encodeURIComponent(id)}/related`, signal),
    pmaxis<unknown>(`/v1/markets/${encodeURIComponent(id)}/trades?limit=8`, signal),
  ])
  return {
    health: jobs[0].status === 'fulfilled' ? asHealth(jobs[0].value) : null,
    related: jobs[1].status === 'fulfilled' ? asList(jobs[1].value) : [],
    trades: jobs[2].status === 'fulfilled' ? asTrades(jobs[2].value) : [],
  }
}

export async function fetchMarketCandles(
  id: string,
  resolution: '1m' | '1h',
  signal?: AbortSignal,
): Promise<Candle[]> {
  const routes = [
    `/v1/markets/${encodeURIComponent(id)}/price-history?resolution=${resolution}&limit=48`,
    ...(resolution === '1h'
      ? [
          (() => {
            const to = Math.floor(Date.now() / 1000)
            return `/v1/markets/${encodeURIComponent(id)}/candles?resolution=60&from=${to - 48 * 60 * 60}&to=${to}`
          })(),
        ]
      : []),
  ]
  for (const route of routes) {
    try {
      const candles = asCandles(await pmaxis(route, signal))
      if (candles.length >= 2) return candles
    } catch (error) {
      if (signal?.aborted) throw error
    }
  }
  return []
}

function candleOf(row: unknown): Candle | null {
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN)
  let t = NaN
  let o = NaN
  let h = NaN
  let l = NaN
  let c = NaN
  if (Array.isArray(row)) {
    ;[t, o, h, l, c] = row.map(num)
  } else if (row && typeof row === 'object') {
    const r = row as Record<string, unknown>
    t = num(r.time ?? r.t ?? r.ts ?? r.timestamp)
    o = num(r.open ?? r.o)
    h = num(r.high ?? r.h)
    l = num(r.low ?? r.l)
    c = num(r.close ?? r.c)
    if (!Number.isFinite(o)) o = c
    if (!Number.isFinite(h)) h = Math.max(o, c)
    if (!Number.isFinite(l)) l = Math.min(o, c)
  }
  if (![t, o, h, l, c].every(Number.isFinite)) return null
  return { time: t < 1e12 ? t * 1000 : t, open: o, high: h, low: l, close: c }
}

function asCandles(data: unknown): Candle[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).candles ??
        (data as Record<string, unknown>).data ??
        (data as Record<string, unknown>).items ??
        (data as Record<string, unknown>).bars ??
        [])
      : []
  if (!Array.isArray(rows)) return []
  return rows
    .map(candleOf)
    .filter((c): c is Candle => c !== null)
    .sort((a, b) => a.time - b.time)
    .slice(-48)
}

function asHealth(data: unknown): Health | null {
  if (!data || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  const status = String(rec.status ?? rec.freshness ?? rec.state ?? '')
  if (!status) return null
  return { status, detail: typeof rec.detail === 'string' ? rec.detail : undefined }
}

function asTrades(data: unknown): Print[] {
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).trades ??
        (data as Record<string, unknown>).data ??
        (data as Record<string, unknown>).items)
      : []
  if (!Array.isArray(raw)) return []
  const out: Print[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const price = Number(r.price)
    if (!Number.isFinite(price)) continue
    const size = Number(r.size ?? r.amount ?? r.quantity)
    const print: Print = {
      price,
      size: Number.isFinite(size) ? size : 0,
      side: String(r.side ?? ''),
    }
    if (typeof r.timestamp === 'number') print.at = r.timestamp
    out.push(print)
    if (out.length >= 8) break
  }
  return out
}

function asEvents(data: unknown): MarketEvent[] {
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as Record<string, unknown>).events ??
        (data as Record<string, unknown>).data ??
        (data as Record<string, unknown>).items)
      : []
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return { id: '', title: '' }
      const rec = row as Record<string, unknown>
      const id = String(rec.id ?? rec.event_id ?? rec.slug ?? '')
      const title = String(rec.title ?? rec.name ?? rec.ticker ?? rec.slug ?? id)
      return { id, title }
    })
    .filter((e) => e.id)
    .slice(0, 40)
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

export async function fetchMarketDeltas(
  ids: string[],
  signal?: AbortSignal,
): Promise<Record<string, MarketDelta>> {
  const out: Record<string, MarketDelta> = {}
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10)
    if (chunk.length === 0) continue
    const res = await pmaxis<{ data?: unknown[] }>(
      `/v1/markets/compare?ids=${encodeURIComponent(chunk.join(','))}`,
      signal,
    )
    for (const row of asList(res)) {
      const m = row as Market
      const id = marketId(m)
      if (!id) continue
      const s = m.stats_24h ?? {}
      out[id] = {
        changePct: typeof s.price_change_pct === 'number' ? s.price_change_pct : undefined,
        volume24h:
          typeof s.volume_24h === 'number'
            ? s.volume_24h
            : typeof m.volume_24h === 'number'
              ? m.volume_24h
              : undefined,
      }
    }
  }
  return out
}

export function formatEnds(endTime: string | undefined, now = Date.now()): string {
  if (!endTime) return ''
  const t = Date.parse(endTime)
  if (Number.isNaN(t)) return ''
  const diff = t - now
  if (diff <= 0) return 'ended'
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function idsFromToolText(text: string): string[] {
  const ids = new Set<string>()
  const re = /"market_id"\s*:\s*"?(\d+)"?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) ids.add(m[1])
  return [...ids]
}

export function marketsFromToolText(text: string): { id: string; title: string }[] {
  try {
    const rows = asList(JSON.parse(text) as unknown)
    const mapped = rows
      .map((m) => ({ id: marketId(m), title: marketTitle(m) }))
      .filter((m) => m.id)
    if (mapped.length) return mapped.slice(0, 8)
  } catch {
    /* not json */
  }
  return idsFromToolText(text).map((id) => ({ id, title: id }))
}
