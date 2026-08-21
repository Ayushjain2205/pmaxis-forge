import { useEffect, useState } from 'react'
import {
  fetchCompare,
  fetchInspectExtras,
  formatPx,
  formatVol,
  isWatched,
  marketId,
  marketPrice,
  marketTitle,
  type Health,
  type InspectExtras,
  type Market,
  type Orderbook,
  type Print,
} from '../lib/pmaxis'

function Bone({ className }: { className?: string }) {
  return <span className={className ? `skel ${className}` : 'skel'} aria-hidden />
}

function BookLevels({
  levels,
  pending,
  empty,
  side,
}: {
  levels: { price: number; size: number }[]
  pending: boolean
  empty: string
  side: 'bid' | 'ask'
}) {
  if (pending && levels.length === 0) {
    return (
      <>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="lvl">
            <Bone className="skel-px" />
            <Bone className="skel-size" />
          </div>
        ))}
      </>
    )
  }
  if (levels.length === 0) return <p className="muted">{empty}</p>
  return (
    <>
      {levels.map((lvl, i) => (
        <div key={`${side}${i}`} className={`lvl ${side}`}>
          <span>{formatPx(lvl.price)}</span>
          <span>{lvl.size}</span>
        </div>
      ))}
    </>
  )
}

function PricePath({ points }: { points: number[] }) {
  if (points.length < 2) return <p className="muted">No path yet.</p>
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100
      const y = 28 - ((p - min) / span) * 26
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
  const up = points[points.length - 1] >= points[0]
  return (
    <div className="path-wrap">
      <svg viewBox="0 0 100 30" className={up ? 'path up' : 'path down'} aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.25" />
      </svg>
      <div className="row-meta">
        <span className="muted">{formatPx(points[0])}</span>
        <span className="px">{formatPx(points[points.length - 1])}</span>
      </div>
    </div>
  )
}

function healthLabel(health: Health | null): string {
  if (!health) return ''
  const s = health.status.toLowerCase()
  if (s.includes('fresh')) return 'Book looks fresh'
  if (s.includes('stale')) return 'Data may be stale'
  if (s.includes('missing')) return 'No live book'
  return health.status
}

export function InspectorSheet({
  pinnedId,
  detail,
  book,
  stats,
  error,
  loading,
  onClose,
  onPin,
  onWatch,
}: {
  pinnedId: string
  detail: Market | null
  book: Orderbook
  stats: Record<string, unknown>
  error: string | null
  loading?: boolean
  onClose?: () => void
  onPin: (id: string) => void
  onWatch: (market: Market) => void
}) {
  const title = detail ? marketTitle(detail) : pinnedId
  const px = detail ? marketPrice(detail) : undefined
  const bids = book.bids ?? []
  const asks = book.asks ?? []
  const bookPending = Boolean(loading) && bids.length === 0 && asks.length === 0
  const quotePending = Boolean(loading) && !detail
  const watched = isWatched(pinnedId)

  const [extras, setExtras] = useState<InspectExtras>({
    health: null,
    related: [],
    path: [],
    trades: [],
  })
  const [versus, setVersus] = useState<Market[]>([])
  const [extraLoading, setExtraLoading] = useState(true)

  useEffect(() => {
    const ac = new AbortController()
    setExtras({ health: null, related: [], path: [], trades: [] })
    setVersus([])
    setExtraLoading(true)
    void (async () => {
      try {
        const next = await fetchInspectExtras(pinnedId, ac.signal)
        if (ac.signal.aborted) return
        setExtras(next)
      } catch {
        if (ac.signal.aborted) return
      } finally {
        if (!ac.signal.aborted) setExtraLoading(false)
      }
    })()
    return () => ac.abort()
  }, [pinnedId])

  async function compareWith(other: Market) {
    const otherId = marketId(other)
    if (!otherId) return
    try {
      const rows = await fetchCompare([pinnedId, otherId])
      setVersus(rows.length ? rows : [detail, other].filter(Boolean) as Market[])
    } catch {
      setVersus([detail, other].filter(Boolean) as Market[])
    }
  }

  return (
    <div className="inspect-pane" aria-busy={loading || extraLoading || undefined}>
      {onClose ? (
        <div className="col-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="ghost"
            aria-pressed={watched}
            onClick={() =>
              onWatch({
                market_id: pinnedId,
                question: title,
                price: px,
              })
            }
          >
            {watched ? 'Watching' : 'Watch'}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Back
          </button>
        </div>
      ) : null}
      <div className="scroll pad">
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <p className="inspect-id">
          {pinnedId}
          {extras.health ? ` · ${healthLabel(extras.health)}` : extraLoading ? ' · Fetching path' : ''}
        </p>
        <div className="kv">
          <span className="k">Price</span>
          {quotePending && px === undefined ? (
            <Bone className="skel-px" />
          ) : (
            <span className="px">{formatPx(px)}</span>
          )}
          <span className="k">Bid / ask</span>
          {quotePending ? (
            <Bone className="skel-quote" />
          ) : (
            <span className="mono">
              {formatPx(detail?.best_bid)} / {formatPx(detail?.best_ask)}
            </span>
          )}
          <span className="k">Status</span>
          {quotePending ? (
            <Bone className="skel-meta" />
          ) : (
            <span>{detail?.status ?? '—'}</span>
          )}
          {Object.entries(stats)
            .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
            .slice(0, 6)
            .map(([k, v]) => (
              <span key={k} className="kv-pair">
                <span>{k}</span>
                <span className="mono">{String(v)}</span>
              </span>
            ))}
        </div>

        <h3>Path</h3>
        {extraLoading && extras.path.length === 0 ? (
          <Bone className="skel-path" />
        ) : (
          <PricePath points={extras.path} />
        )}

        <div className="book">
          <div>
            <h3>Bids</h3>
            <BookLevels levels={bids} pending={bookPending} empty="No bids yet." side="bid" />
          </div>
          <div>
            <h3>Asks</h3>
            <BookLevels levels={asks} pending={bookPending} empty="No asks yet." side="ask" />
          </div>
        </div>

        <h3>Prints</h3>
        {extraLoading && extras.trades.length === 0 ? (
          <p className="muted">Fetching prints…</p>
        ) : extras.trades.length === 0 ? (
          <p className="muted">No recent prints.</p>
        ) : (
          extras.trades.map((t: Print, i) => (
            <div key={i} className={`lvl ${t.side.toLowerCase() === 'buy' ? 'bid' : 'ask'}`}>
              <span>{formatPx(t.price)}</span>
              <span>{t.size}</span>
            </div>
          ))
        )}

        {versus.length >= 2 ? (
          <>
            <h3>Compare</h3>
            <div className="compare">
              {versus.map((m) => (
                <button
                  key={marketId(m)}
                  type="button"
                  className="row"
                  onClick={() => onPin(marketId(m))}
                >
                  <span className="q">{marketTitle(m)}</span>
                  <span className="row-meta">
                    <span className="px">{formatPx(marketPrice(m))}</span>
                    <span className="vol">{formatVol(m.volume_24h ?? m.volume)}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        <h3>Related</h3>
        {extraLoading && extras.related.length === 0 ? (
          <p className="muted">Fetching related…</p>
        ) : extras.related.length === 0 ? (
          <p className="muted">No related markets.</p>
        ) : (
          extras.related.slice(0, 8).map((m) => {
            const id = marketId(m)
            return (
              <div key={id || marketTitle(m)} className="related-row">
                <button type="button" className="row" onClick={() => id && onPin(id)}>
                  <span className="q">{marketTitle(m)}</span>
                  <span className="row-meta">
                    <span className="px">{formatPx(marketPrice(m))}</span>
                  </span>
                </button>
                <button type="button" className="ghost" onClick={() => void compareWith(m)}>
                  Compare
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
