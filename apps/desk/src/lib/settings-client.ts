/**
 * Client for the host-side settings store.
 */

export type ToolField = {
  id: string
  label: string
  type: 'secret' | 'text' | 'number' | 'boolean'
  envKey?: string
  fallbackEnvKey?: string
  default?: string | number | boolean
  placeholder?: string
}

export type ToolDef = {
  label: string
  description: string
  fields: ToolField[]
}

export type ToolDefinitions = {
  agents: Record<string, Record<string, ToolDef>>
  global: Record<string, ToolDef>
}

export type ToolSettings = Record<string, Record<string, string | number | boolean>>

export async function fetchToolDefinitions(): Promise<ToolDefinitions> {
  const res = await fetch('/forge/tool-definitions', { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Failed to fetch tool definitions: ${res.status}`)
  return res.json()
}

export async function fetchSettings(): Promise<Record<string, unknown>> {
  const res = await fetch('/forge/settings', { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`)
  return res.json()
}

export async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  const res = await fetch('/forge/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error(`Failed to save settings: ${res.status}`)
}

export async function fetchAgentSettings(agentId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/forge/settings/${agentId}`, { headers: { accept: 'application/json' } })
  if (!res.ok) return {}
  return res.json()
}

export async function saveAgentToolSettings(
  agentId: string,
  toolId: string,
  values: Record<string, string | number | boolean>,
): Promise<void> {
  const current = await fetchSettings()
  const agentSettings = (typeof current[agentId] === 'object' && current[agentId] !== null
    ? current[agentId]
    : {}) as Record<string, unknown>
  const tools = (typeof agentSettings.tools === 'object' && agentSettings.tools !== null
    ? agentSettings.tools
    : {}) as Record<string, unknown>
  tools[toolId] = values
  agentSettings.tools = tools
  current[agentId] = agentSettings
  await saveSettings(current)
}

export async function fetchAgentKeyStatus(): Promise<Record<string, { configured: boolean }>> {
  try {
    const res = await fetch('/forge/agent-keys', { headers: { accept: 'application/json' } })
    const data = await res.json()
    return data.agents ?? {}
  } catch {
    return {}
  }
}
