import { useEffect, useRef, useState } from 'react'
import { rpc } from '../lib/rpc'
import { ToolSettings } from './ToolSettings'

type ModelGroup = { id: string; name: string; models: { id: string; name: string }[] }

export function GlobalSettingsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [groups, setGroups] = useState<ModelGroup[]>([])
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState<string | null>(null)

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
        const catalog = await rpc<{ groups: ModelGroup[] }>('llm.models', {})
        setGroups(catalog.groups)
        if (catalog.groups[0]?.models[0]) {
          setProvider(catalog.groups[0].id)
          setModel(catalog.groups[0].models[0].id)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [open])

  async function save() {
    setError(null)
  }

  return (
    <dialog
      ref={dialogRef}
      id="global-settings-dialog"
      className="settings-dialog settings-dialog--wide"
      aria-labelledby="global-settings-title"
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
        <h2 id="global-settings-title">Global Settings</h2>
        <p className="lede">API keys and default model for all agents.</p>

        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}

        <ToolSettings agentId="_global" />

        <fieldset className="settings-section">
          <legend>Default Model</legend>
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
