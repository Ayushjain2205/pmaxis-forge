import { useEffect, useRef, useState } from 'react'
import {
  AGENT_PRESETS,
  groupByPreset,
  listSessions,
} from '../lib/agents'
import { formatWhen } from '../lib/sessions'

type SessionRow = {
  sessionId: string
  title: string
  updatedAt: number
  running: boolean
  blank: boolean
  preset?: string
}

export function AgentRail({
  activeSessionId,
  refreshTrigger,
  onSelectSession,
  onDeleteSession,
  onNewSession,
  onOpenSettings,
  onOpenGlobalSettings,
}: {
  activeSessionId: string | null
  refreshTrigger: number
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onNewSession: (presetId: string) => void
  onOpenSettings: (presetId: string) => void
  onOpenGlobalSettings: () => void
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['research']))

  useEffect(() => {
    let active = true
    void listSessions().then((rows) => {
      if (active) setSessions(rows)
    })
    const t = window.setInterval(() => {
      void listSessions().then((rows) => {
        if (active) setSessions(rows)
      })
    }, 15_000)
    return () => {
      active = false
      window.clearInterval(t)
    }
  }, [])

  useEffect(() => {
    void listSessions().then((rows) => setSessions(rows))
  }, [refreshTrigger])

  const deleteRef = useRef(onDeleteSession)
  deleteRef.current = onDeleteSession

  useEffect(() => {
    function handleDelete(e: Event) {
      const target = e.target as HTMLElement
      const sessionId = target?.getAttribute?.('data-delete-session')
      if (!sessionId) return
      e.preventDefault()
      e.stopPropagation()
      deleteRef.current(sessionId)
    }
    document.addEventListener('click', handleDelete, true)
    return () => document.removeEventListener('click', handleDelete, true)
  }, [])

  const groups = groupByPreset(sessions)

  function togglePreset(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <nav className="agent-rail" id="sessions-rail" aria-label="Agents">
      <div className="col-head">
        <h2>Agents</h2>
      </div>
      <div className="scroll">
        {AGENT_PRESETS.map((preset) => {
          const presetSessions = groups.get(preset.id) ?? []
          const isExpanded = expanded.has(preset.id)
          const hasActive = presetSessions.some((s) => s.sessionId === activeSessionId)

          return (
            <div key={preset.id} className={`agent-group ${hasActive ? 'has-active' : ''}`}>
              <div className="agent-folder-row">
                <button
                  type="button"
                  className="agent-folder"
                  aria-expanded={isExpanded}
                  onClick={() => togglePreset(preset.id)}
                >
                  <span className="agent-icon">{preset.icon}</span>
                  <span className="agent-name">{preset.name}</span>
                  <span className="agent-count">{presetSessions.length || ''}</span>
                  <svg
                    className="agent-chevron"
                    width="10"
                    height="10"
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="ghost agent-settings-btn"
                  aria-label={`${preset.name} settings`}
                  title={`${preset.name} settings`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenSettings(preset.id)
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path
                      d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M13.5 8c0-.3-.1-.6-.4-.8l-1-.7.4-1.7-1.5-.9-.7 1c-.3-.1-.5-.2-.8-.2l-.2-1.7H7.3l-.2 1.7c-.3 0-.5.1-.8.2l-.7-1-1.5.9.4 1.7-1 .7c-.2.2-.4.5-.4.8 0 .3.1.6.4.8l1 .7-.4 1.7 1.5.9.7-1c.3.1.5.2.8.2l.2 1.7h1.8l.2-1.7c.3 0 .5-.1.8-.2l.7 1 1.5-.9-.4-1.7 1-.7c.2-.2.4-.5.4-.8Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                </button>
              </div>
              {isExpanded ? (
                <div className="agent-sessions">
                  {presetSessions.length === 0 ? (
                    <p className="empty">No threads yet.</p>
                  ) : null}
                  {presetSessions.map((s) => (
                    <div
                      key={s.sessionId}
                      className={`session-row ${activeSessionId === s.sessionId ? 'active' : ''}`}
                      data-session-id={s.sessionId}
                    >
                      <button
                        type="button"
                        className="session-row-main"
                        onClick={() => onSelectSession(s.sessionId)}
                      >
                        <span className="session-title">{s.blank ? 'New thread' : s.title}</span>
                        <span className="session-meta">
                          {s.running ? 'Live · ' : ''}
                          {formatWhen(s.updatedAt)}
                        </span>
                      </button>
                      <span
                        className="session-delete-btn"
                        data-delete-session={s.sessionId}
                        title="Delete thread"
                      >
                        ✕
                      </span>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="ghost add-session"
                    onClick={() => onNewSession(preset.id)}
                  >
                    + New thread
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="rail-foot">
        <button
          type="button"
          className="ghost"
          aria-haspopup="dialog"
          onClick={onOpenGlobalSettings}
        >
          Settings
        </button>
      </div>
    </nav>
  )
}
