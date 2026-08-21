import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownBody } from './components/MarkdownBody'
import { connectMux } from './lib/mux'
import {
  fetchBoard,
  fetchMarket,
  fetchOrderbook,
  fetchStats,
  formatPx,
  formatVol,
  idsFromToolText,
  marketId,
  marketPrice,
  marketTitle,
  type Market,
  type Orderbook,
} from './lib/pmaxis'
import { respond, rpc } from './lib/rpc'

type BoardKind = 'top' | 'breaking' | 'resolving'

type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'tool'; name: string; args: string; result?: string; ok?: boolean }

type ModelGroup = { id: string; name: string; models: { id: string; name: string }[] }

function extractText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n')
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if (typeof rec.text === 'string') return rec.text
    if (rec.content !== undefined) return extractText(rec.content)
    if (rec.message !== undefined) return extractText(rec.message)
  }
  return ''
}

function eventType(ev: Record<string, unknown>): string {
  return String(ev.type ?? '')
}

export function App() {
  const [boardKind, setBoardKind] = useState<BoardKind>('top')
  const [markets, setMarkets] = useState<Market[]>([])
  const [boardError, setBoardError] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Market | null>(null)
  const [book, setBook] = useState<Orderbook>({ bids: [], asks: [] })
  const [stats, setStats] = useState<Record<string, unknown>>({})
  const [inspectError, setInspectError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [items, setItems] = useState<ChatItem[]>([])
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<Map<string, string>>(new Map())

  const loadBoard = useCallback(async (kind: BoardKind) => {
    try {
      setBoardError(null)
      setMarkets(await fetchBoard(kind))
    } catch (error) {
      setBoardError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => {
    void loadBoard(boardKind)
    const t = window.setInterval(() => void loadBoard(boardKind), 15_000)
    return () => window.clearInterval(t)
  }, [boardKind, loadBoard])

  useEffect(() => {
    if (!pinnedId) {
      setDetail(null)
      setBook({ bids: [], asks: [] })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        setInspectError(null)
        const [m, b, s] = await Promise.all([
          fetchMarket(pinnedId),
          fetchOrderbook(pinnedId),
          fetchStats(pinnedId),
        ])
        if (cancelled) return
        setDetail(m)
        setBook(b)
        setStats(s)
      } catch (error) {
        if (!cancelled) setInspectError(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pinnedId])

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId
    const created = await rpc<{ sessionId: string }>('session.create', { agentPreset: 'pmex' })
    setSessionId(created.sessionId)
    return created.sessionId
  }, [sessionId])

  const ingestEvent = useCallback((event: Record<string, unknown>) => {
    const type = eventType(event)
    const data = (event.data as Record<string, unknown> | undefined) ?? {}
    if (type === 'user/message') {
      const text = extractText(data.message ?? data)
      if (text)
        setItems((prev) => [...prev, { id: crypto.randomUUID(), kind: 'user', text }])
    } else if (type === 'assistant/message') {
      const text = extractText(data.message ?? data)
      if (!text) return
      setItems((prev) => {
        const last = prev[prev.length - 1]
        if (last?.kind === 'assistant') {
          const next = [...prev]
          next[next.length - 1] = { ...last, text }
          return next
        }
        return [...prev, { id: crypto.randomUUID(), kind: 'assistant', text }]
      })
    } else if (type === 'assistant/chunk') {
      const chunk = extractText(data)
      if (!chunk) return
      setItems((prev) => {
        const last = prev[prev.length - 1]
        if (last?.kind === 'assistant') {
          const next = [...prev]
          next[next.length - 1] = { ...last, text: last.text + chunk }
          return next
        }
        return [...prev, { id: crypto.randomUUID(), kind: 'assistant', text: chunk }]
      })
    } else if (type === 'tool/call') {
      const name = String(data.name ?? 'tool')
      const args = typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments ?? {})
      const callId = String(data.callId ?? crypto.randomUUID())
      toolsRef.current.set(callId, name)
      setItems((prev) => [...prev, { id: callId, kind: 'tool', name, args }])
    } else if (type === 'tool/result') {
      const msg = (data.message as Record<string, unknown> | undefined) ?? {}
      const source = (msg.source as Record<string, unknown> | undefined) ?? {}
      const callId = String(source.callId ?? '')
      const text = extractText(msg.content ?? data)
      const ok = !data.error && !/unknown tool|isError/i.test(text)
      for (const id of idsFromToolText(text)) {
        setPinnedId((current) => current ?? id)
      }
      setItems((prev) =>
        prev.map((item) =>
          item.kind === 'tool' && (item.id === callId || (!callId && item.result === undefined))
            ? { ...item, result: text, ok }
            : item,
        ),
      )
    } else if (type === 'turn/end') {
      setRunning(false)
    } else if (type === 'turn/start') {
      setRunning(true)
    }
  }, [])

  useEffect(() => {
    const ws = connectMux((payload, rpcId) => {
      const type = String(payload.type ?? '')
      if (type === 'session/event' && payload.event && typeof payload.event === 'object') {
        ingestEvent(payload.event as Record<string, unknown>)
      }
      if (type === 'approval/requested' && rpcId) {
        void respond(rpcId, {
          sessionId: payload.sessionId,
          approvalId: payload.approvalId,
          outcome: 'allowed-once',
        })
      }
    })
    return () => ws.close()
  }, [ingestEvent])

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: 'end' })
  }, [items, running])

  async function send() {
    const text = draft.trim()
    if (!text || running) return
    setChatError(null)
    setDraft('')
    try {
      const id = await ensureSession()
      setRunning(true)
      await rpc('session.prompt', {
        sessionId: id,
        mode: 'queue',
        content: [{ type: 'text', text }],
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    } catch (error) {
      setRunning(false)
      setChatError(error instanceof Error ? error.message : String(error))
    }
  }

  async function cancel() {
    if (!sessionId) return
    try {
      await rpc('session.cancel', { sessionId })
    } catch {
      /* ignore */
    }
  }

  async function newSession() {
    setItems([])
    setSessionId(null)
    setRunning(false)
    toolsRef.current.clear()
  }

  return (
    <div className="desk">
      <header className="top">
        <div className="brand">
          <strong>forge</strong>
          <span>research desk</span>
        </div>
        <div className="top-actions">
          <span className={`status-dot${running ? ' on' : ''}`} aria-hidden />
          <button type="button" className="ghost" onClick={() => void newSession()}>
            new session
          </button>
          <button
            type="button"
            className="ghost"
            aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            keys
          </button>
        </div>
      </header>

      <div className="columns">
        <section className="col" aria-label="Boards">
          <div className="col-head">
            <span>boards</span>
            <div className="tabs" role="tablist">
              {(['top', 'breaking', 'resolving'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={boardKind === kind}
                  onClick={() => setBoardKind(kind)}
                >
                  {kind}
                </button>
              ))}
            </div>
          </div>
          <div className="scroll">
            {boardError ? <p className="empty err">{boardError}</p> : null}
            {!boardError && markets.length === 0 ? <p className="empty">No markets yet.</p> : null}
            {markets.map((m) => {
              const id = marketId(m)
              return (
                <button
                  key={id || marketTitle(m)}
                  type="button"
                  className="row"
                  aria-current={pinnedId === id}
                  onClick={() => setPinnedId(id)}
                >
                  <span className="q">{marketTitle(m)}</span>
                  <span className="px">{formatPx(marketPrice(m))}</span>
                  <span className="vol">{formatVol(m.volume_24h ?? m.volume)}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="col" aria-label="Chat">
          <div className="col-head">
            <span>agent</span>
            {running ? (
              <button type="button" className="ghost" onClick={() => void cancel()}>
                stop
              </button>
            ) : (
              <span className="muted">{sessionId ? sessionId.slice(0, 14) : 'idle'}</span>
            )}
          </div>
          <div className="scroll chat-log" ref={logRef}>
            {items.length === 0 ? (
              <p className="empty">Ask about live markets. Tool calls stay visible.</p>
            ) : null}
            {items.map((item) =>
              item.kind === 'tool' ? (
                <details key={item.id} className="tool" open={!item.result}>
                  <summary>
                    {item.name}
                    {item.ok === false ? ' · failed' : ''}
                  </summary>
                  <pre className="body">{item.args}</pre>
                  {item.result ? <pre className="body muted">{item.result.slice(0, 4000)}</pre> : null}
                </details>
              ) : (
                <div key={item.id} className={`bubble ${item.kind}`}>
                  <div className="who">{item.kind === 'user' ? 'you' : 'forge'}</div>
                  {item.kind === 'assistant' ? (
                    <MarkdownBody text={item.text} />
                  ) : (
                    <div className="body">{item.text}</div>
                  )}
                </div>
              ),
            )}
            {chatError ? <p className="err">{chatError}</p> : null}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <textarea
              value={draft}
              placeholder="What’s moving, and is the book real?"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <button className="send" type="submit" disabled={running || !draft.trim()}>
              send
            </button>
          </form>
        </section>

        <Inspector
          pinnedId={pinnedId}
          detail={detail}
          book={book}
          stats={stats}
          error={inspectError}
        />
      </div>

      {settingsOpen ? (
        <Settings sessionId={sessionId} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </div>
  )
}

function Inspector({
  pinnedId,
  detail,
  book,
  stats,
  error,
}: {
  pinnedId: string | null
  detail: Market | null
  book: Orderbook
  stats: Record<string, unknown>
  error: string | null
}) {
  if (!pinnedId) {
    return (
      <section className="col" aria-label="Inspector">
        <div className="col-head">
          <span>inspector</span>
        </div>
        <p className="empty">Pin a board row, or wait for the agent to name a market.</p>
      </section>
    )
  }

  const title = detail ? marketTitle(detail) : pinnedId
  const px = detail ? marketPrice(detail) : undefined

  return (
    <section className="col" aria-label="Inspector">
      <div className="col-head">
        <span>inspector</span>
        <span className="muted">{pinnedId}</span>
      </div>
      <div className="scroll pad inspect">
        {error ? <p className="err">{error}</p> : null}
        <h2>{title}</h2>
        <div className="kv">
          <span className="muted">price</span>
          <span className="px">{formatPx(px)}</span>
          <span className="muted">bid / ask</span>
          <span>
            {formatPx(detail?.best_bid)} / {formatPx(detail?.best_ask)}
          </span>
          <span className="muted">status</span>
          <span>{detail?.status ?? '—'}</span>
          {Object.entries(stats)
            .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
            .slice(0, 8)
            .map(([k, v]) => (
              <span key={k} style={{ display: 'contents' }}>
                <span className="muted">{k}</span>
                <span>{String(v)}</span>
              </span>
            ))}
        </div>
        <div className="book">
          <div>
            <h3>bids</h3>
            {(book.bids ?? []).map((lvl, i) => (
              <div key={`b${i}`} className="lvl bid">
                <span>{formatPx(lvl.price)}</span>
                <span>{lvl.size}</span>
              </div>
            ))}
          </div>
          <div>
            <h3>asks</h3>
            {(book.asks ?? []).map((lvl, i) => (
              <div key={`a${i}`} className="lvl ask">
                <span>{formatPx(lvl.price)}</span>
                <span>{lvl.size}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Settings({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const [openrouter, setOpenrouter] = useState('')
  const [deepseek, setDeepseek] = useState('')
  const [orConfigured, setOrConfigured] = useState(false)
  const [dsConfigured, setDsConfigured] = useState(false)
  const [groups, setGroups] = useState<ModelGroup[]>([])
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const creds = await rpc<{
          credentials: Record<string, { configured: boolean }>
        }>('credentials.describe', { refs: ['OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY'] })
        setOrConfigured(Boolean(creds.credentials.OPENROUTER_API_KEY?.configured))
        setDsConfigured(Boolean(creds.credentials.DEEPSEEK_API_KEY?.configured))
        const catalog = await rpc<{ groups: ModelGroup[] }>('llm.models', {})
        setGroups(catalog.groups)
        if (sessionId) {
          const sm = await rpc<{ current: { provider: string; model: string } }>('session.models', {
            sessionId,
          })
          setProvider(sm.current.provider)
          setModel(sm.current.model)
        } else if (catalog.groups[0]?.models[0]) {
          setProvider(catalog.groups[0].id)
          setModel(catalog.groups[0].models[0].id)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [sessionId])

  const models = useMemo(
    () => groups.find((g) => g.id === provider)?.models ?? [],
    [groups, provider],
  )

  async function save() {
    setError(null)
    setSaved(false)
    try {
      if (openrouter.trim()) {
        await rpc('credentials.set', { ref: 'OPENROUTER_API_KEY', value: openrouter.trim() })
        setOrConfigured(true)
        setOpenrouter('')
      }
      if (deepseek.trim()) {
        await rpc('credentials.set', { ref: 'DEEPSEEK_API_KEY', value: deepseek.trim() })
        setDsConfigured(true)
        setDeepseek('')
      }
      if (sessionId && provider && model) {
        await rpc('session.selectModel', { sessionId, provider, model })
      }
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="sheet" role="dialog" aria-label="Keys and model">
      <div className="card">
        <h2>keys</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Stored in ~/.dsh. The PMAxis key stays on the host process, never in this form.
        </p>
        {error ? <p className="err">{error}</p> : null}
        {saved ? <p className="ok">saved</p> : null}
        <label className="field">
          <span>OpenRouter {orConfigured ? '(set)' : '(missing)'}</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-or-…"
            value={openrouter}
            onChange={(e) => setOpenrouter(e.target.value)}
          />
        </label>
        <label className="field">
          <span>DeepSeek {dsConfigured ? '(set)' : '(optional)'}</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-…"
            value={deepseek}
            onChange={(e) => setDeepseek(e.target.value)}
          />
        </label>
        <label className="field">
          <span>provider</span>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value)
              const first = groups.find((g) => g.id === e.target.value)?.models[0]
              if (first) setModel(first.id)
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="top-actions">
          <button type="button" className="send" onClick={() => void save()}>
            save
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            close
          </button>
        </div>
      </div>
    </div>
  )
}
