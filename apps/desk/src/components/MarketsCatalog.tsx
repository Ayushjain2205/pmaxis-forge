import { useCallback, useEffect, useId, useState } from 'react'
import { InspectorSheet } from './InspectorSheet'
import {
  fetchCatalog,
  fetchCategories,
  formatPx,
  formatVol,
  marketId,
  marketPrice,
  marketTitle,
  type CatalogScope,
  type Category,
  type FeedKind,
  type Market,
  type Orderbook,
} from '../lib/pmaxis'

const FEEDS: { id: FeedKind; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'breaking', label: 'Breaking' },
  { id: 'resolving', label: 'Resolving' },
  { id: 'trending', label: 'Trending' },
]

export function MarketsCatalog({
  pinnedId,
  detail,
  book,
  stats,
  inspectError,
  onPin,
  onCloseInspect,
}: {
  pinnedId: string | null
  detail: Market | null
  book: Orderbook
  stats: Record<string, unknown>
  inspectError: string | null
  onPin: (id: string) => void
  onCloseInspect: () => void
}) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [scope, setScope] = useState<Exclude<CatalogScope, { kind: 'search' }>>({ kind: 'all' })
  const [categories, setCategories] = useState<Category[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 280)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchCategories()
        if (!cancelled) setCategories(rows)
      } catch {
        if (!cancelled) setCategories([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const searching = debounced.length >= 2
  const catalogKey = searching
    ? `search:${debounced}`
    : scope.kind === 'all'
      ? 'all'
      : scope.kind === 'feed'
        ? `feed:${scope.id}`
        : `category:${scope.slug}`

  const load = useCallback(async (next: CatalogScope) => {
    try {
      setError(null)
      setMarkets(await fetchCatalog(next))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMarkets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const next: CatalogScope = searching
      ? { kind: 'search', q: debounced }
      : scope
    setLoading(true)
    void load(next)
    const t = window.setInterval(() => void load(next), 15_000)
    return () => window.clearInterval(t)
  }, [catalogKey, searching, debounced, scope, load])

  if (pinnedId) {
    return (
      <InspectorSheet
        pinnedId={pinnedId}
        detail={detail}
        book={book}
        stats={stats}
        error={inspectError}
        onClose={onCloseInspect}
      />
    )
  }

  const selectedLabel = searching
    ? `Search “${debounced}”`
    : scope.kind === 'all'
      ? 'All markets'
      : scope.kind === 'feed'
        ? FEEDS.find((f) => f.id === scope.id)?.label ?? scope.id
        : categories.find((c) => c.slug === scope.slug)?.name ?? scope.slug

  return (
    <>
      <div className="col-head">
        <h2>Markets</h2>
        <span className="muted">{selectedLabel}</span>
      </div>
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
        <div className="pills" role="group" aria-label="Market filters">
          <button
            type="button"
            aria-pressed={!searching && scope.kind === 'all'}
            onClick={() => {
              setQuery('')
              setScope({ kind: 'all' })
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
              }}
            >
              {feed.label}
            </button>
          ))}
        </div>
        {categories.length > 0 ? (
          <div className="pills" role="group" aria-label="Categories">
            {categories.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                aria-pressed={!searching && scope.kind === 'category' && scope.slug === cat.slug}
                onClick={() => {
                  setQuery('')
                  setScope({ kind: 'category', slug: cat.slug })
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="scroll">
        {error ? (
          <p className="empty err" role="alert">
            Markets failed to load. Try another filter, or check the host is up.
          </p>
        ) : null}
        {loading && markets.length === 0 && !error ? <p className="empty">Loading markets…</p> : null}
        {!loading && !error && markets.length === 0 ? (
          <p className="empty">No markets in this view.</p>
        ) : null}
        {markets.map((m) => {
          const id = marketId(m)
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
                <span className="px">{formatPx(marketPrice(m))}</span>
                <span className="vol">{formatVol(m.volume_24h ?? m.volume)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
