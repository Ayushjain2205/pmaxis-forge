import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatLog } from './components/ChatLog'
import { KeysDialog } from './components/KeysDialog'
import { MarketsCatalog } from './components/MarketsCatalog'
import { type ChatItem, eventType, extractText, foldHistory } from './lib/chat'
import { connectMux } from './lib/mux'
import {
  askPrompt,
  fetchMarket,
  fetchOrderbook,
  fetchStats,
  idsFromToolText,
  type Market,
  type Orderbook,
} from './lib/pmaxis'
import { respond, rpc } from './lib/rpc'
import { formatWhen, listSessions, loadHistory, type SessionRow } from './lib/sessions'

export function App() {
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Market | null>(null)
  const [book, setBook] = useState<Orderbook>({ bids: [], asks: [] })
  const [stats, setStats] = useState<Record<string, unknown>>({})
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState(false)

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
  const [catalogOpen, setCatalogOpen] = useState(true)
  const [narrow, setNarrow] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
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
    if (mq.matches) {
      setSessionsOpen(false)
      setCatalogOpen(false)
    }
    const onChange = (e: MediaQueryListEvent) => {
      setNarrow(e.matches)
      setSessionsOpen(!e.matches)
      setCatalogOpen(!e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => void refreshSessions(), 15_000)
    return () => window.clearInterval(t)
  }, [refreshSessions])

  useEffect(() => {
    if (!pinnedId) {
      setDetail(null)
      setBook({ bids: [], asks: [] })
      setStats({})
      setInspectError(null)
      setInspecting(false)
      return
    }
    setInspecting(true)
    setDetail(null)
    setBook({ bids: [], asks: [] })
    setStats({})
    setInspectError(null)
    const ac = new AbortController()
    void (async () => {
      const jobs = [
        fetchMarket(pinnedId, ac.signal).then((m) => {
          if (!ac.signal.aborted) setDetail(m)
        }),
        fetchOrderbook(pinnedId, ac.signal).then((b) => {
          if (!ac.signal.aborted) setBook(b)
        }),
        fetchStats(pinnedId, ac.signal).then((s) => {
          if (!ac.signal.aborted) setStats(s)
        }),
      ]
      const results = await Promise.allSettled(jobs)
      if (ac.signal.aborted) return
      const failed = results.find((r) => r.status === 'rejected')
      if (failed && failed.status === 'rejected') {
        const reason = failed.reason
        setInspectError(reason instanceof Error ? reason.message : String(reason))
      }
      setInspecting(false)
    })()
    return () => ac.abort()
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
        if (!text) return
        setItems((prev) => {
          const last = prev[prev.length - 1]
          if (last?.kind === 'user' && last.text === text) return prev
          return [...prev, { id: crypto.randomUUID(), kind: 'user', text }]
        })
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
          setCatalogOpen(true)
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
    const el = promptRef.current
    if (!el) return
    el.style.height = '0px'
    const raw = el.scrollHeight
    el.style.height = `${Math.min(Math.max(raw, 72), 168)}px`
    el.style.overflowY = raw > 168 ? 'auto' : 'hidden'
  }, [draft])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || settingsOpen) return
      if (pinnedId) {
        setPinnedId(null)
        return
      }
      if (catalogOpen && narrow) {
        setCatalogOpen(false)
        return
      }
      if (sessionsOpen && narrow) setSessionsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinnedId, catalogOpen, sessionsOpen, narrow, settingsOpen])

  async function sendText(text: string) {
    if (!text || running) return
    setChatError(null)
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

  async function sendPrompt(text: string) {
    const next = text.trim()
    if (!next || running) return
    setItems((prev) => {
      const last = prev[prev.length - 1]
      if (last?.kind === 'user' && last.text === next) return prev
      return [...prev, { id: crypto.randomUUID(), kind: 'user', text: next }]
    })
    await sendText(next)
  }

  async function send() {
    const text = draft.trim()
    if (!text || running) return
    setDraft('')
    await sendPrompt(text)
  }

  async function askAboutMarket(market: Market) {
    if (running) return
    if (narrow) setCatalogOpen(false)
    await sendPrompt(askPrompt(market))
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

  const visibleSessions = sessions.filter((s) => !s.blank || s.sessionId === sessionId)
  const showScrim = narrow && (sessionsOpen || catalogOpen)
  const liveLabel = running ? 'Agent is running' : chatError ? chatError : 'Agent idle'
  const sessionTitle =
    visibleSessions.find((s) => s.sessionId === sessionId && !s.blank)?.title ?? ''

  useEffect(() => {
    document.title = sessionTitle ? `${sessionTitle} · forge` : 'forge'
  }, [sessionTitle])

  const deskClass = [
    'desk',
    sessionsOpen ? 'sessions-open' : '',
    catalogOpen ? 'catalog-open' : '',
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

      {sessionsOpen && !narrow ? (
        <div className="rail-head">
          <div className="top-left">
            <div className="brand">
              <h1>forge</h1>
            </div>
            <button
              type="button"
              className="ghost icon-toggle"
              aria-label="Hide sessions"
              title="Hide sessions"
              aria-controls="sessions-rail"
              onClick={() => setSessionsOpen(false)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
                <path d="M5.5 2.5v11" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      <header className="top">
        {!sessionsOpen || narrow ? (
          <div className="top-left">
            <div className="brand">
              <h1>forge</h1>
            </div>
            <button
              type="button"
              className="ghost icon-toggle rail-toggle"
              aria-expanded={sessionsOpen}
              aria-controls="sessions-rail"
              aria-label={sessionsOpen ? 'Hide sessions' : 'Show sessions'}
              title={sessionsOpen ? 'Hide sessions' : 'Show sessions'}
              onClick={() => setSessionsOpen((v) => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
                <path d="M5.5 2.5v11" />
              </svg>
            </button>
          </div>
        ) : null}
        <div className="top-actions">
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
          <button
            type="button"
            className="ghost catalog-toggle"
            aria-expanded={catalogOpen}
            aria-controls="markets-catalog"
            onClick={() => setCatalogOpen((v) => !v)}
          >
            Markets
          </button>
        </div>
      </header>

      {showScrim ? (
        <button
          type="button"
          className="scrim"
          aria-label="Close panel"
          onClick={() => {
            if (catalogOpen) setCatalogOpen(false)
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
          <ChatLog
            items={items}
            running={running}
            error={chatError}
            onPin={(id) => {
              setPinnedId(id)
              setCatalogOpen(true)
            }}
            onPrompt={(text) => void sendPrompt(text)}
          />
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
              ref={promptRef}
              id="prompt"
              name="prompt"
              rows={3}
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
          <p className="composer-hint">Enter to send · Shift+Enter for a new line</p>
        </form>
      </section>

      <aside className="catalog" id="markets-catalog" aria-label="Market catalog">
        <MarketsCatalog
          pinnedId={pinnedId}
          detail={detail}
          book={book}
          stats={stats}
          inspectError={inspectError}
          inspecting={inspecting}
          asking={running}
          onPin={(id) => {
            setPinnedId(id)
            setCatalogOpen(true)
          }}
          onAsk={(market) => void askAboutMarket(market)}
        />
      </aside>

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
