import { useEffect, useState } from 'react'
import {
  fetchToolDefinitions,
  fetchAgentSettings,
  saveAgentToolSettings,
  type ToolDefinitions,
  type ToolDef,
} from '../lib/settings-client'

type Props = {
  agentId: string
  onSaved?: () => void
}

type FieldValues = Record<string, string | number | boolean>

export function ToolSettings({ agentId, onSaved }: Props) {
  const [defs, setDefs] = useState<ToolDefinitions | null>(null)
  const [values, setValues] = useState<Record<string, FieldValues>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [toolDefs, agentSettings] = await Promise.all([
          fetchToolDefinitions(),
          fetchAgentSettings(agentId),
        ])
        setDefs(toolDefs)
        const savedValues = (agentSettings.tools ?? {}) as Record<string, FieldValues>
        setValues(savedValues)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [agentId])

  if (!defs) return <p className="muted">Loading tools...</p>

  const agentTools = defs.agents[agentId] ?? {}
  const toolEntries = Object.entries(agentTools)

  if (toolEntries.length === 0) {
    return <p className="muted">No configurable tools for this agent.</p>
  }

  function updateField(toolId: string, fieldId: string, value: string | number | boolean) {
    setValues((prev) => ({
      ...prev,
      [toolId]: {
        ...(prev[toolId] ?? {}),
        [fieldId]: value,
      },
    }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      for (const [toolId, toolValues] of Object.entries(values)) {
        await saveAgentToolSettings(agentId, toolId, toolValues)
      }
      setSaved(true)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="tool-settings">
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

      {toolEntries.map(([toolId, tool]) => (
        <ToolSection
          key={toolId}
          toolId={toolId}
          tool={tool}
          values={values[toolId] ?? {}}
          onChange={(fieldId, value) => updateField(toolId, fieldId, value)}
        />
      ))}

      <div className="dialog-actions">
        <button className="send" type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function ToolSection({
  tool,
  values,
  onChange,
}: {
  toolId: string
  tool: ToolDef
  values: FieldValues
  onChange: (fieldId: string, value: string | number | boolean) => void
}) {
  return (
    <fieldset className="settings-section tool-section">
      <legend>{tool.label}</legend>
      <p className="key-note">{tool.description}</p>
      <div className="tool-fields">
        {tool.fields.map((field) => (
          <ToolFieldInput
            key={field.id}
            field={field}
            value={values[field.id] ?? field.default ?? ''}
            onChange={(v) => onChange(field.id, v)}
          />
        ))}
      </div>
    </fieldset>
  )
}

function ToolFieldInput({
  field,
  value,
  onChange,
}: {
  field: import('../lib/settings-client').ToolField
  value: string | number | boolean
  onChange: (v: string | number | boolean) => void
}) {
  if (field.type === 'boolean') {
    return (
      <label className="field field-toggle">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    )
  }

  return (
    <label className="field">
      <span>{field.label}</span>
      <input
        type={field.type === 'secret' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        autoComplete="off"
        placeholder={field.placeholder}
        value={String(value)}
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </label>
  )
}
