import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENT_PRESETS, getPreset } from '../lib/agents'
import { rpc } from '../lib/rpc'

type ModelGroup = { id: string; name: string; models: { id: string; name: string }[] }

export function KeysDialog({
  open,
  sessionId,
  initialPresetId,
  onClose,
}: {
  open: boolean
  sessionId: string | null
  initialPresetId?: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activePreset, setActivePreset] = useState<string>(initialPresetId ?? 'research')
  const [openrouter, setOpenrouter] = useState('')
  const [deepseek, setDeepseek] = useState('')
  const [groups, setGroups] = useState<ModelGroup[]>([])
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const preset = getPreset(activePreset) ?? AGENT_PRESETS[0]

  useEffect(() => {
    if (initialPresetId) setActivePreset(initialPresetId)
  }, [initialPresetId])

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
        await rpc<{
          credentials: Record<string, { configured: boolean }>
        }>('credentials.describe', { refs: ['OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY'] })
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
  }, [open, sessionId])

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
        setOpenrouter('')
      }
      if (deepseek.trim()) {
        await rpc('credentials.set', { ref: 'DEEPSEEK_API_KEY', value: deepseek.trim() })
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
    <dialog
      ref={dialogRef}
      id="settings-dialog"
      className="settings-dialog"
      aria-labelledby="settings-title"
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
        <h2 id="settings-title">Settings</h2>

        <div className="agent-tabs" role="tablist">
          {AGENT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activePreset === p.id}
              className={`agent-tab ${activePreset === p.id ? 'active' : ''}`}
              onClick={() => {
                setActivePreset(p.id)
                setSaved(false)
              }}
            >
              <span className="agent-tab-icon">{p.icon}</span>
              {p.name}
            </button>
          ))}
        </div>

        <div className="agent-settings" role="tabpanel">
          <div className="agent-info">
            <h3>{preset.name}</h3>
            <p className="muted">{preset.description}</p>
          </div>

          <fieldset className="agent-tools">
            <legend>Tools</legend>
            <div className="tool-list">
              {preset.tools.map((t) => (
                <span key={t} className="tool-badge">
                  {t}
                </span>
              ))}
            </div>
          </fieldset>

          <fieldset className="agent-keys">
            <legend>API Keys</legend>
            <p className="key-note">
              The {preset.name} key is managed by the host process. It never reaches the browser.
            </p>
          </fieldset>
        </div>

        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="ok" role="status">
            Saved. Close this dialog to return to the desk.
          </p>
        ) : null}

        <fieldset className="model-section">
          <legend>Model</legend>
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
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
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
