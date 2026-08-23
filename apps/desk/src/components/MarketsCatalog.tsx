import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { InspectorSheet } from './InspectorSheet'
import {
  CORE_CATEGORIES,
  fetchCatalog,
  fetchCategories,
  fetchEvents,
  fetchMarketDeltas,
  peekCatalog,
  formatEnds,
  formatPx,
  formatVol,
  marketId,
  marketPrice,
  marketTitle,
  toggleWatch,
  type CatalogScope,
  type Category,
  type FeedKind,
  type Market,
  type MarketDelta,
  type MarketEvent,
  type Orderbook,
} from '../lib/pmaxis'

const FEEDS: { id: FeedKind; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'breaking', label: 'Breaking' },
  { id: 'resolving', label: 'Resolving' },
  { id: 'trending', label: 'Trending' },
  { id: 'new', label: 'New' },
]

export function MarketsCatalog({
  pinnedId,
  detail,
  book,
  stats,
  inspectError,
  inspecting,
  asking,
  onPin,
  onAsk,
}: {
  pinnedId: string | null
  detail: Market | null
  book: Orderbook
  stats: Record<string, unknown>
  inspectError: string | null
  inspecting: boolean
  asking: boolean
  onPin: (id: string | null) => void
  onAsk: (market: Market) => void
}) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [scope, setScope] = useState<Exclude<CatalogScope, { kind: 'search' }>>({
    kind: 'feed',
    id: 'top',
  })
  const [categories, setCategories] = useState<Category[]>(CORE_CATEGORIES)
  const [markets, setMarkets] = useState<Market[]>([])
  const [events, setEvents] = useState<MarketEvent[]>([])
  const [watchTick, setWatchTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deltas, setDeltas] = useState<Record<string, MarketDelta>>({})

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 280)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    const ac = new AbortController()
    void (async () => {
      try {
        const rows = await fetchCategories(ac.signal)
        if (!ac.signal.aborted) setCategories(rows)
      } catch {
        /* aborted or offline — keep CORE_CATEGORIES */
      }
    })()
    return () => ac.abort()
  }, [])

  const searching = debounced.length >= 2
  const catalogKey = searching
    ? `search:${debounced}`
    : scope.kind === 'all'
      ? 'all'
      : scope.kind === 'feed'
        ? `feed:${scope.id}`
        : scope.kind === 'watching'
          ? `watching:${watchTick}`
          : scope.kind === 'events'
            ? 'events'
            : scope.kind === 'event'
              ? `event:${scope.id}`
              : `category:${scope.slug}`

  const load = useCallback(async (next: CatalogScope, signal: AbortSignal, quiet = false) => {
    try {
      if (!quiet) {
        setError(null)
        setLoading(true)
      }
      if (next.kind === 'events') {
        const rows = await fetchEvents(signal)
        if (signal.aborted) return
        setEvents(rows)
        setMarkets([])
        setError(null)
        return
      }
      const rows = await fetchCatalog(next, signal)
      if (signal.aborted) return
      setEvents([])
      setMarkets(rows)
      setError(null)
    } catch (e) {
      if (signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
      setMarkets([])
      setEvents([])
    } finally {
      if (!signal.aborted && !quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const next: CatalogScope = searching ? { kind: 'search', q: debounced } : scope
    const cached = next.kind === 'events' || next.kind === 'watching' ? null : peekCatalog(next)
    if (cached) {
      setMarkets(cached)
      setLoading(false)
      setError(null)
    } else {
      setMarkets([])
      setEvents([])
      setLoading(true)
    }
    void load(next, ac.signal, Boolean(cached))
    const t = window.setInterval(() => void load(next, ac.signal, true), 20_000)
    return () => {
      ac.abort()
      window.clearInterval(t)
    }
  }, [catalogKey, searching, debounced, scope, load])

  const idsKey = useMemo(() => markets.map((m) => marketId(m) ?? '').filter(Boolean).join(','), [markets])

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      setDeltas({})
      return
    }
    const ac = new AbortController()
    const run = () => {
      void fetchMarketDeltas(ids, ac.signal)
        .then((d) => {
          if (!ac.signal.aborted && Object.keys(d).length > 0) {
            setDeltas((prev) => ({ ...prev, ...d }))
          }
        })
        .catch(() => {})
    }
    run()
    const iv = window.setInterval(run, 120_000)
    return () => {
      ac.abort()
      window.clearInterval(iv)
    }
  }, [idsKey])

  const selected = useMemo(() => {
    if (!pinnedId) return null
    return markets.find((m) => marketId(m) === pinnedId) ?? detail
  }, [pinnedId, markets, detail])

  const selectedLabel = searching
    ? `Search “${debounced}”`
    : scope.kind === 'all'
      ? 'All'
      : scope.kind === 'feed'
        ? FEEDS.find((f) => f.id === scope.id)?.label ?? scope.id
        : scope.kind === 'watching'
          ? 'Watching'
          : scope.kind === 'events'
            ? 'Events'
            : scope.kind === 'event'
              ? scope.name
              : categories.find((c) => c.slug === scope.slug)?.name ?? scope.slug

  return (
    <>
      {pinnedId ? null : (
        <div className="filters">
          <label>
            <span className="vh">Search markets</span>
            <input
              id={searchId}
              type="search"
              placeholder="Search a topic"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        <div className="pills">
          <div className="pill-group" role="group" aria-label="Boards">
          <button
            type="button"
            aria-pressed={!searching && scope.kind === 'all'}
            onClick={() => {
              setQuery('')
              setScope({ kind: 'all' })
              onPin(null)
            }}
          >
            All
          </button>
          {FEEDS.map((feed) => (
            <button
              key={feed.id}
              type="button"
              aria-pressed={!searching && scope.kind === 'feed' && scope.id === feed.id}
              onClick={() => {
                setQuery('')
                setScope({ kind: 'feed', id: feed.id })
                onPin(null)
              }}
            >
              {feed.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={!searching && scope.kind === 'watching'}
            onClick={() => {
              setQuery('')
              setScope({ kind: 'watching' })
              onPin(null)
            }}
          >
            Watching
          </button>
          <button
            type="button"
            aria-pressed={!searching && (scope.kind === 'events' || scope.kind === 'event')}
            onClick={() => {
              setQuery('')
              setScope({ kind: 'events' })
              onPin(null)
            }}
          >
            Events
          </button>
          </div>
          <span className="pill-sep" aria-hidden />
          <div className="pill-group" role="group" aria-label="Categories">
          {categories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              aria-pressed={!searching && scope.kind === 'category' && scope.slug === cat.slug}
              onClick={() => {
                setQuery('')
                setScope({ kind: 'category', slug: cat.slug })
                onPin(null)
              }}
            >
              {cat.name}
            </button>
          ))}
          </div>
        </div>
      </div>
      )}
      {pinnedId ? (
        <InspectorSheet
          pinnedId={pinnedId}
          detail={detail ?? selected}
          book={book}
          stats={stats}
          error={inspectError}
          loading={inspecting}
          onClose={() => onPin(null)}
          onPin={(id) => onPin(id)}
          onWatch={(market) => {
            toggleWatch(market)
            setWatchTick((n) => n + 1)
          }}
          onAsk={onAsk}
          asking={asking}
        />
      ) : (
        <div className="scroll" aria-busy={loading || undefined}>
          {loading && markets.length === 0 && events.length === 0 ? (
            <div className="skel-list" aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="row skel-row">
                  <span className={`skel skel-q skel-w${(i % 3) + 1}`} />
                  <span className="row-meta">
                    <span className="skel skel-meta" />
                    <span className="skel skel-px" />
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {loading ? (
            <p className="vh" role="status">
              Fetching {selectedLabel}
            </p>
          ) : null}
          {!loading && error ? (
            <p className="empty err" role="alert">
              Markets failed to load. Try another filter, or check the host is up.
            </p>
          ) : null}
          {!loading && !error && scope.kind === 'events' && events.length === 0 ? (
            <p className="empty">No live events.</p>
          ) : null}
          {!loading && !error && scope.kind !== 'events' && markets.length === 0 ? (
            <p className="empty">
              {scope.kind === 'watching'
                ? 'Watch a market from inspect to keep it here.'
                : `No markets in ${selectedLabel.toLowerCase()}.`}
            </p>
          ) : null}
          {scope.kind === 'events' && !searching
            ? events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className="row"
                  onClick={() => {
                    setScope({ kind: 'event', id: ev.id, name: ev.title })
                    onPin(null)
                  }}
                >
                  <span className="q">{ev.title}</span>
                </button>
              ))
            : markets.map((m) => {
            const id = marketId(m)
            const delta = id ? deltas[id] : undefined
            const ch = delta?.changePct
            const ends = formatEnds(m.end_time)
            const endsSoon = m.end_time ? Date.parse(m.end_time) - Date.now() < 86_400_000 : false
            return (
              <button
                key={id || marketTitle(m)}
                type="button"
                className="row"
                onClick={() => id && onPin(id)}
              >
                <span className="q">{marketTitle(m)}</span>
                <span className="row-meta">
                  {m.category ? <span className="muted">{m.category}</span> : null}
                  {ends ? (
                    <span className={endsSoon ? 'end soon' : 'end'} title={m.end_time}>
                      {ends}
                    </span>
                  ) : null}
                  {typeof ch === 'number' && ch !== 0 ? (
                    <span className={ch > 0 ? 'delta up' : 'delta down'}>
                      {ch > 0 ? '▲' : '▼'} {Math.abs(ch).toFixed(1)}%
                    </span>
                  ) : null}
                  <span className="px">{formatPx(marketPrice(m))}</span>
                  <span className="vol">
                    {formatVol(delta?.volume24h ?? m.volume_24h ?? m.volume)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
