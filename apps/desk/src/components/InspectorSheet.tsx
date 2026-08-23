import { useEffect, useState } from 'react'
import {
  fetchCompare,
  fetchInspectExtras,
  fetchMarketCandles,
  formatPx,
  formatVol,
  isWatched,
  marketId,
  marketPrice,
  marketTitle,
  type Candle,
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

function Candles({ candles }: { candles: Candle[] }) {
  if (candles.length < 2) return <p className="muted">Not enough data for a chart.</p>
  const W = 100
  const H = 40
  const pad = 2
  const lo = Math.min(...candles.map((c) => c.low))
  const hi = Math.max(...candles.map((c) => c.high))
  const span = hi - lo || 1
  const slot = W / candles.length
  const bodyW = Math.max(0.8, slot * 0.6)
  const y = (p: number) => pad + (1 - (p - lo) / span) * (H - pad * 2)
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart" aria-hidden>
        {candles.map((c, i) => {
          const x = i * slot + slot / 2
          const up = c.close >= c.open
          const top = y(Math.max(c.open, c.close))
          const bottom = y(Math.min(c.open, c.close))
          return (
            <g key={i} className={up ? 'cup' : 'cdn'}>
              <line
                x1={x}
                x2={x}
                y1={y(c.high)}
                y2={y(c.low)}
                stroke="currentColor"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={x - bodyW / 2}
                y={top}
                width={bodyW}
                height={Math.max(0.5, bottom - top)}
                fill="currentColor"
              />
            </g>
          )
        })}
      </svg>
      <div className="chart-axis">
        <span>{formatPx(lo)}</span>
        <span className="muted">{candles.length} bars</span>
        <span className="px">{formatPx(candles[candles.length - 1].close)}</span>
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
  onAsk,
  asking,
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
  onAsk?: (market: Market) => void
  asking?: boolean
}) {
  const title = detail ? marketTitle(detail) : pinnedId
  const bids = book.bids ?? []
  const asks = book.asks ?? []
  const bestBid = bids[0]?.price
  const bestAsk = asks[0]?.price
  const detailPx = detail ? marketPrice(detail) : undefined
  const livePx =
    detailPx ?? (bestBid !== undefined && bestAsk !== undefined ? (bestBid + bestAsk) / 2 : undefined)
  const bookPending = Boolean(loading) && bids.length === 0 && asks.length === 0
  const quotePending = Boolean(loading) && !detail
  const watched = isWatched(pinnedId)

  const [extras, setExtras] = useState<InspectExtras>({
    health: null,
    related: [],
    trades: [],
  })
  const [versus, setVersus] = useState<Market[]>([])
  const [extraLoading, setExtraLoading] = useState(true)
  const [resolution, setResolution] = useState<'1m' | '1h'>('1m')
  const [candles, setCandles] = useState<Candle[]>([])
  const [chartLoading, setChartLoading] = useState(true)

  useEffect(() => {
    const ac = new AbortController()
    setChartLoading(true)
    void (async () => {
      try {
        const rows = await fetchMarketCandles(pinnedId, resolution, ac.signal)
        if (!ac.signal.aborted) setCandles(rows)
      } catch {
        /* keep previous chart */
      } finally {
        if (!ac.signal.aborted) setChartLoading(false)
      }
    })()
    return () => ac.abort()
  }, [pinnedId, resolution])

  useEffect(() => {
    const ac = new AbortController()
    setExtras({ health: null, related: [], trades: [] })
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
        <header className="inspect-head">
          <div className="inspect-top">
            <button type="button" className="ghost" onClick={onClose}>
              Back
            </button>
            <button
              type="button"
              className="ghost"
              aria-pressed={watched}
              onClick={() =>
                onWatch({
                  market_id: pinnedId,
                  question: title,
                  price: livePx,
                })
              }
            >
              {watched ? '★ Watching' : '☆ Watch'}
            </button>
          </div>
          <h2>{title}</h2>
          {onAsk ? (
            <button
              type="button"
              className="send"
              disabled={asking}
              onClick={() => detail && onAsk(detail)}
            >
              {asking ? 'Asking…' : 'Ask about this'}
            </button>
          ) : null}
          <p className="inspect-id">
            {pinnedId}
            {extras.health
              ? ` · ${healthLabel(extras.health)}`
              : extraLoading
                ? ' · Fetching path'
                : ''}
          </p>
        </header>
      ) : null}
      <div className="scroll pad">
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <div className="kv">
          <span className="k">Price</span>
          {quotePending && livePx === undefined ? (
            <Bone className="skel-px" />
          ) : (
            <span className="px">{formatPx(livePx)}</span>
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

        <div className="chart-head">
          <h3>Chart</h3>
          <div className="seg" role="group" aria-label="Chart resolution">
            {(['1m', '1h'] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={resolution === r}
                onClick={() => setResolution(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {chartLoading && candles.length === 0 ? (
          <Bone className="skel-path" />
        ) : (
          <Candles candles={candles} />
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

        <h3>Recent trades</h3>
        {extraLoading && extras.trades.length === 0 ? (
          <p className="muted">Fetching trades…</p>
        ) : extras.trades.length === 0 ? (
          <p className="muted">No recent trades.</p>
        ) : (
          extras.trades.map((t: Print, i) => {
            const buy = t.side.toLowerCase() === 'buy'
            return (
              <div key={i} className={`print ${buy ? 'buy' : 'sell'}`}>
                <span className="t">
                  {t.at ? new Date(t.at).toLocaleTimeString([], { hour12: false }) : '—'}
                </span>
                <span className="side">{buy ? 'BUY' : 'SELL'}</span>
                <span className="mono">{formatPx(t.price)}</span>
                <span className="size">{t.size}</span>
              </div>
            )
          })
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
