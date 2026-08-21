import {
  formatPx,
  marketPrice,
  marketTitle,
  type Market,
  type Orderbook,
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

export function InspectorSheet({
  pinnedId,
  detail,
  book,
  stats,
  error,
  loading,
  onClose,
}: {
  pinnedId: string
  detail: Market | null
  book: Orderbook
  stats: Record<string, unknown>
  error: string | null
  loading?: boolean
  onClose?: () => void
}) {
  const title = detail ? marketTitle(detail) : pinnedId
  const px = detail ? marketPrice(detail) : undefined
  const bids = book.bids ?? []
  const asks = book.asks ?? []
  const bookPending = Boolean(loading) && bids.length === 0 && asks.length === 0
  const quotePending = Boolean(loading) && !detail

  return (
    <div className="inspect-pane" aria-busy={loading || undefined}>
      {onClose ? (
        <div className="col-head">
          <h2>{title}</h2>
          {loading ? <span className="muted">Fetching book</span> : null}
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
        <p className="inspect-id">{pinnedId}</p>
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
            .slice(0, 8)
            .map(([k, v]) => (
              <span key={k} className="kv-pair">
                <span>{k}</span>
                <span className="mono">{String(v)}</span>
              </span>
            ))}
        </div>
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
      </div>
    </div>
  )
}
