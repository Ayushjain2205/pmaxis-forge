import { useEffect, useRef, useState } from 'react'
import { AGENT_PRESETS, getPreset } from '../lib/agents'
import { rpc } from '../lib/rpc'

type ModelGroup = { id: string; name: string; models: { id: string; name: string }[] }
type AgentKeyStatus = Record<string, { configured: boolean }>

async function fetchAgentKeys(): Promise<AgentKeyStatus> {
  try {
    const res = await fetch('/forge/agent-keys', { headers: { accept: 'application/json' } })
    const data = await res.json()
    return data.agents ?? {}
  } catch {
    return {}
  }
}

export function AgentSettingsDialog({
  open,
  presetId,
  sessionId,
  onClose,
}: {
  open: boolean
  presetId: string
  sessionId: string | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [groups, setGroups] = useState<ModelGroup[]>([])
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [keyStatus, setKeyStatus] = useState<AgentKeyStatus>({})

  const preset = getPreset(presetId) ?? AGENT_PRESETS[0]

  useEffect(() => {
    const node = dialogRef.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    void (async () => {
      try {
        const [catalog, keys] = await Promise.all([
          rpc<{ groups: ModelGroup[] }>('llm.models', {}),
          fetchAgentKeys(),
        ])
        setGroups(catalog.groups)
        setKeyStatus(keys)
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
  }, [open, sessionId])

  async function save() {
    setError(null)
    setSaved(false)
    try {
      if (sessionId && provider && model) {
        await rpc('session.selectModel', { sessionId, provider, model })
      }
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const keyConfigured = keyStatus[preset.id]?.configured ?? false

  return (
    <dialog
      ref={dialogRef}
      id="agent-settings-dialog"
      className="settings-dialog"
      aria-labelledby="agent-settings-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <form
        className="settings-form"
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <h2 id="agent-settings-title">
          <span className="settings-agent-icon">{preset.icon}</span>
          {preset.name} Settings
        </h2>

        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="ok" role="status">
            Saved.
          </p>
        ) : null}

        <div className="agent-info">
          <p className="muted">{preset.description}</p>
        </div>

        <fieldset className="settings-section">
          <legend>API Key</legend>
          <p className="key-note">
            {keyConfigured ? (
              <span className="key-status key-set">PMAxis key set for this agent</span>
            ) : (
              <span className="key-status key-missing">No key set — set {preset.envKey} in your shell profile</span>
            )}
          </p>
          <p className="key-note" style={{ marginTop: 'var(--space-2)' }}>
            Keys are read from environment variables and never reach the browser.
            {preset.fallbackKey ? ` Falls back to ${preset.fallbackKey} if unset.` : ''}
          </p>
        </fieldset>

        <fieldset className="settings-section">
          <legend>Tools</legend>
          <div className="tool-list">
            {preset.tools.map((t) => (
              <span key={t} className="tool-badge">
                {t}
              </span>
            ))}
          </div>
        </fieldset>

        <fieldset className="settings-section">
          <legend>Model Override</legend>
          <p className="key-note">Override the default model for this agent only.</p>
          <label className="field">
            <span>Provider</span>
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
            <span>Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {groups.map((g) =>
                g.id === provider
                  ? g.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))
                  : null,
              )}
            </select>
          </label>
        </fieldset>

        <div className="dialog-actions">
          <button className="send" type="submit">
            Save
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </dialog>
  )
}
