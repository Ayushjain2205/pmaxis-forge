import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { InspectorSheet } from './components/InspectorSheet'
import { KeysDialog } from './components/KeysDialog'
import { MarkdownBody } from './components/MarkdownBody'
import { type ChatItem, eventType, extractText, foldHistory } from './lib/chat'
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
import { formatWhen, listSessions, loadHistory, type SessionRow } from './lib/sessions'

type BoardKind = 'top' | 'breaking' | 'resolving'

const BOARD_TABS: BoardKind[] = ['top', 'breaking', 'resolving']

export function App() {
  const tabBase = useId()
  const [boardKind, setBoardKind] = useState<BoardKind>('top')
  const [markets, setMarkets] = useState<Market[]>([])
  const [boardLoading, setBoardLoading] = useState(true)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Market | null>(null)
  const [book, setBook] = useState<Orderbook>({ bids: [], asks: [] })
  const [stats, setStats] = useState<Record<string, unknown>>({})
  const [inspectError, setInspectError] = useState<string | null>(null)

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = sessionId

  const [items, setItems] = useState<ChatItem[]>([])
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(true)
  const [narrow, setNarrow] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<Map<string, string>>(new Map())
  const openGen = useRef(0)

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions())
    } catch {
      /* list is best-effort */
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 960px)')
    const sync = () => setNarrow(mq.matches)
    sync()
    if (mq.matches) setSessionsOpen(false)
    const onChange = (e: MediaQueryListEvent) => {
      setNarrow(e.matches)
      setSessionsOpen(!e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => void refreshSessions(), 15_000)
    return () => window.clearInterval(t)
  }, [refreshSessions])

  const loadBoard = useCallback(async (kind: BoardKind) => {
    try {
      setBoardError(null)
      const rows = await fetchBoard(kind)
      setMarkets(rows)
    } catch (error) {
      setBoardError(error instanceof Error ? error.message : String(error))
      setMarkets([])
    } finally {
      setBoardLoading(false)
    }
  }, [])

  useEffect(() => {
    setBoardLoading(true)
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

  const openSession = useCallback(async (id: string) => {
    const gen = ++openGen.current
    setChatError(null)
    setSessionId(id)
    sessionIdRef.current = id
    toolsRef.current.clear()
    if (window.matchMedia('(max-width: 960px)').matches) setSessionsOpen(false)
    try {
      const hist = await loadHistory(id)
      if (gen !== openGen.current) return
      setItems(foldHistory(hist.events ?? []))
      const listed = await listSessions()
      if (gen !== openGen.current) return
      setSessions(listed)
      setRunning(Boolean(listed.find((s) => s.sessionId === id)?.running))
    } catch (error) {
      if (gen !== openGen.current) return
      setItems([])
      setChatError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const listed = await listSessions()
        if (cancelled) return
        setSessions(listed)
        const last = listed.find((s) => !s.blank)
        if (last) await openSession(last.sessionId)
      } catch {
        /* first paint can be empty */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openSession])

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId
    const created = await rpc<{ sessionId: string }>('session.create', { agentPreset: 'pmex' })
    setSessionId(created.sessionId)
    sessionIdRef.current = created.sessionId
    void refreshSessions()
    return created.sessionId
  }, [sessionId, refreshSessions])

  const ingestEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = eventType(event)
      const data = (event.data as Record<string, unknown> | undefined) ?? {}
      if (type === 'user/message') {
        const text = extractText(data.message ?? data)
        if (text) setItems((prev) => [...prev, { id: crypto.randomUUID(), kind: 'user', text }])
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
        const args =
          typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments ?? {})
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
        void refreshSessions()
      } else if (type === 'turn/start') {
        setRunning(true)
      } else if (type === 'session/title') {
        void refreshSessions()
      }
    },
    [refreshSessions],
  )

  useEffect(() => {
    const ws = connectMux((payload, rpcId) => {
      const type = String(payload.type ?? '')
      const sid = typeof payload.sessionId === 'string' ? payload.sessionId : undefined
      if (type === 'session/event' && payload.event && typeof payload.event === 'object') {
        if (sid && sid !== sessionIdRef.current) return
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || settingsOpen) return
      if (pinnedId) {
        setPinnedId(null)
        return
      }
      if (sessionsOpen && narrow) setSessionsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinnedId, sessionsOpen, narrow, settingsOpen])

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
      void refreshSessions()
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
    openGen.current += 1
    setItems([])
    setRunning(false)
    setChatError(null)
    toolsRef.current.clear()
    try {
      const created = await rpc<{ sessionId: string }>('session.create', { agentPreset: 'pmex' })
      setSessionId(created.sessionId)
      sessionIdRef.current = created.sessionId
      await refreshSessions()
    } catch (error) {
      setSessionId(null)
      sessionIdRef.current = null
      setChatError(error instanceof Error ? error.message : String(error))
    }
  }

  function onBoardTabKey(e: React.KeyboardEvent, current: BoardKind) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End')
      return
    e.preventDefault()
    let next = current
    const i = BOARD_TABS.indexOf(current)
    if (e.key === 'ArrowRight') next = BOARD_TABS[(i + 1) % BOARD_TABS.length]
    if (e.key === 'ArrowLeft') next = BOARD_TABS[(i - 1 + BOARD_TABS.length) % BOARD_TABS.length]
    if (e.key === 'Home') next = BOARD_TABS[0]
    if (e.key === 'End') next = BOARD_TABS[BOARD_TABS.length - 1]
    setBoardKind(next)
    document.getElementById(`${tabBase}-${next}`)?.focus()
  }

  const visibleSessions = sessions.filter((s) => !s.blank || s.sessionId === sessionId)
  const showScrim = narrow && (sessionsOpen || Boolean(pinnedId))
  const liveLabel = running ? 'Agent is running' : chatError ? chatError : 'Agent idle'

  const deskClass = [
    'desk',
    sessionsOpen ? 'sessions-open' : '',
    pinnedId ? 'inspect-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={deskClass}>
      <a className="skip" href="#prompt">
        Skip to prompt
      </a>
      <div className="vh" role="status" aria-live="polite">
        {liveLabel}
      </div>

      <header className="top">
        <div className="brand">
          <h1>forge</h1>
          <p className="session-name">
            {visibleSessions.find((s) => s.sessionId === sessionId && !s.blank)?.title ?? ''}
          </p>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="ghost"
            aria-expanded={sessionsOpen}
            aria-controls="sessions-rail"
            onClick={() => setSessionsOpen((v) => !v)}
          >
            Sessions
          </button>
          {running ? (
            <button type="button" className="ghost" onClick={() => void cancel()}>
              Stop
            </button>
          ) : (
            <span className="run-state">Idle</span>
          )}
          <button
            type="button"
            className="ghost"
            aria-expanded={settingsOpen}
            aria-controls="keys-dialog"
            onClick={() => setSettingsOpen(true)}
          >
            Keys
          </button>
        </div>
      </header>

      <section className="tape" aria-label="Live boards">
        <div className="tape-head">
          <div className="tabs" role="tablist" aria-label="Board">
            {BOARD_TABS.map((kind) => (
              <button
                key={kind}
                id={`${tabBase}-${kind}`}
                type="button"
                role="tab"
                aria-selected={boardKind === kind}
                aria-controls={`${tabBase}-panel`}
                tabIndex={boardKind === kind ? 0 : -1}
                onClick={() => setBoardKind(kind)}
                onKeyDown={(e) => onBoardTabKey(e, kind)}
              >
                {kind[0].toUpperCase() + kind.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div
          className="tape-track"
          id={`${tabBase}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabBase}-${boardKind}`}
        >
          {boardError ? (
            <p className="empty err" role="alert">
              Boards failed to load. Check the host is up, then retry by switching tabs.
            </p>
          ) : null}
          {!boardError && boardLoading && markets.length === 0 ? (
            <p className="empty">Loading live books…</p>
          ) : null}
          {!boardError && !boardLoading && markets.length === 0 ? (
            <p className="empty">No markets on this board.</p>
          ) : null}
          {markets.map((m) => {
            const id = marketId(m)
            return (
              <button
                key={id || marketTitle(m)}
                type="button"
                className="chip"
                aria-current={pinnedId === id || undefined}
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

      {showScrim ? (
        <button
          type="button"
          className="scrim"
          aria-label="Close panel"
          onClick={() => {
            if (pinnedId) setPinnedId(null)
            else setSessionsOpen(false)
          }}
        />
      ) : null}

      <nav className="rail" id="sessions-rail" aria-label="Sessions">
        <div className="col-head">
          <h2>Sessions</h2>
          <button type="button" className="ghost" onClick={() => void newSession()}>
            New thread
          </button>
        </div>
        <div className="scroll">
          {visibleSessions.length === 0 ? (
            <p className="empty">No threads yet. Send a prompt and it lands here.</p>
          ) : null}
          {visibleSessions.map((s) => (
            <button
              key={s.sessionId}
              type="button"
              className="session-row"
              aria-current={sessionId === s.sessionId || undefined}
              onClick={() => void openSession(s.sessionId)}
            >
              <span className="session-title">{s.blank ? 'New thread' : s.title}</span>
              <span className="session-meta">
                {s.running ? 'Live · ' : ''}
                {formatWhen(s.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      </nav>

      <section className="main" aria-label="Research chat">
        <div className="scroll chat-log" ref={logRef}>
          {items.length === 0 ? (
            <p className="empty">
              Ask about a live market, or pick a name from the tape above. Tool calls stay visible
              in the thread.
            </p>
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
                <div className="who">{item.kind === 'user' ? 'You' : 'Forge'}</div>
                {item.kind === 'assistant' ? (
                  <MarkdownBody text={item.text} />
                ) : (
                  <div className="body">{item.text}</div>
                )}
              </div>
            ),
          )}
          {chatError ? (
            <p className="err" role="alert">
              {chatError} Retry send, or open Keys if the model credential is missing.
            </p>
          ) : null}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <label>
            <span className="vh">Prompt</span>
            <textarea
              id="prompt"
              name="prompt"
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
          </label>
          <button className="send" type="submit" disabled={running || !draft.trim()}>
            Send
          </button>
        </form>
      </section>

      {pinnedId ? (
        <InspectorSheet
          pinnedId={pinnedId}
          detail={detail}
          book={book}
          stats={stats}
          error={inspectError}
          onClose={() => setPinnedId(null)}
        />
      ) : null}

      {settingsOpen ? (
        <KeysDialog
          open={settingsOpen}
          sessionId={sessionId}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  )
}
