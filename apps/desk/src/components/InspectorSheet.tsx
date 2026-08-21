import {
  formatPx,
  marketPrice,
  marketTitle,
  type Market,
  type Orderbook,
} from '../lib/pmaxis'

export function InspectorSheet({
  pinnedId,
  detail,
  book,
  stats,
  error,
  onClose,
}: {
  pinnedId: string
  detail: Market | null
  book: Orderbook
  stats: Record<string, unknown>
  error: string | null
  onClose?: () => void
}) {
  const title = detail ? marketTitle(detail) : pinnedId
  const px = detail ? marketPrice(detail) : undefined

  return (
    <div className="inspect-pane">
      {onClose ? (
        <div className="col-head">
          <h2>{title}</h2>
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
          <span className="px">{formatPx(px)}</span>
          <span className="k">Bid / ask</span>
          <span className="mono">
            {formatPx(detail?.best_bid)} / {formatPx(detail?.best_ask)}
          </span>
          <span className="k">Status</span>
          <span>{detail?.status ?? '—'}</span>
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
            {(book.bids ?? []).length === 0 ? <p className="muted">No bids yet.</p> : null}
            {(book.bids ?? []).map((lvl, i) => (
              <div key={`b${i}`} className="lvl bid">
                <span>{formatPx(lvl.price)}</span>
                <span>{lvl.size}</span>
              </div>
            ))}
          </div>
          <div>
            <h3>Asks</h3>
            {(book.asks ?? []).length === 0 ? <p className="muted">No asks yet.</p> : null}
            {(book.asks ?? []).map((lvl, i) => (
              <div key={`a${i}`} className="lvl ask">
                <span>{formatPx(lvl.price)}</span>
                <span>{lvl.size}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
