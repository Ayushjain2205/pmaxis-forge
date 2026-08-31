import { useEffect, useState } from 'react'
import {
  AGENT_PRESETS,
  getDefaultPreset,
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
  onSelectSession,
  onNewSession,
  onOpenSettings,
}: {
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: (presetId: string) => void
  onOpenSettings: (presetId: string) => void
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
              {isExpanded ? (
                <div className="agent-sessions">
                  {presetSessions.length === 0 ? (
                    <p className="empty">No threads yet.</p>
                  ) : null}
                  {presetSessions.map((s) => (
                    <button
                      key={s.sessionId}
                      type="button"
                      className="session-row"
                      aria-current={activeSessionId === s.sessionId || undefined}
                      onClick={() => onSelectSession(s.sessionId)}
                    >
                      <span className="session-title">{s.blank ? 'New thread' : s.title}</span>
                      <span className="session-meta">
                        {s.running ? 'Live · ' : ''}
                        {formatWhen(s.updatedAt)}
                      </span>
                    </button>
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
          onClick={() => onOpenSettings(getDefaultPreset().id)}
        >
          Settings
        </button>
      </div>
    </nav>
  )
}
