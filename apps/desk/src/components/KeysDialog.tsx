import { useEffect, useMemo, useRef, useState } from 'react'
import { rpc } from '../lib/rpc'

type ModelGroup = { id: string; name: string; models: { id: string; name: string }[] }

export function KeysDialog({
  open,
  sessionId,
  onClose,
}: {
  open: boolean
  sessionId: string | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
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
    const node = dialogRef.current
    if (!node) return
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  useEffect(() => {
    if (!open) return
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
    <dialog
      ref={dialogRef}
      id="keys-dialog"
      className="keys-dialog"
      aria-labelledby="keys-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <form
        className="keys-form"
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <h2 id="keys-title">Keys and model</h2>
        <p className="lede">
          Stored in ~/.dsh. The PMAxis key stays on the host process, never in this form.
        </p>
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
        <div className="dialog-actions">
          <button className="send" type="submit">
            Save keys
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
    </dialog>
  )
}
