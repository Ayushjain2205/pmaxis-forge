/**
 * Copies the shipped `pmex` agent preset into the harness user-preset root
 * so the profile default (`pmex`) resolves without a hardcoded profile path.
 * Also loads per-agent API keys from the settings store into env vars.
 */
import { cpSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-pmaxis-preset'

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function loadSettings() {
  const file = join(dshHome(), 'forge-settings.json')
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return {}
  }
}

function resolveKey(store, agentId, toolId, fieldId, envKey, fallbackKey) {
  const agentVal = store[agentId]?.tools?.[toolId]?.[fieldId]
  if (agentVal !== undefined && agentVal !== '') return String(agentVal)
  const globalVal = store._global?.tools?.[toolId]?.[fieldId]
  if (globalVal !== undefined && globalVal !== '') return String(globalVal)
  if (envKey && process.env[envKey]) return process.env[envKey]
  if (fallbackKey && process.env[fallbackKey]) return process.env[fallbackKey]
  return ''
}

export const apply = () => {
  const store = loadSettings()

  // Load per-agent API keys from settings store into env vars
  const agents = [
    { id: 'research', envKey: 'PMAXIS_API_KEY_RESEARCH', fallbackKey: 'PMAXIS_API_KEY' },
    { id: 'copy-trading', envKey: 'PMAXIS_API_KEY_COPY_TRADING', fallbackKey: 'PMAXIS_API_KEY' },
    { id: 'signals', envKey: 'PMAXIS_API_KEY_SIGNALS', fallbackKey: 'PMAXIS_API_KEY' },
  ]
  for (const agent of agents) {
    const key = resolveKey(store, agent.id, 'pmaxis', 'apiKey', agent.envKey, agent.fallbackKey)
    if (key && !process.env[agent.envKey]) {
      process.env[agent.envKey] = key
    }
  }

  // Also set the base PMAXIS_API_KEY if not already set
  if (!process.env.PMAXIS_API_KEY) {
    const baseKey = resolveKey(store, '_global', 'pmaxis', 'apiKey', 'PMAXIS_API_KEY', '')
    if (baseKey) {
      process.env.PMAXIS_API_KEY = baseKey
    } else {
      console.warn(
        'forge: PMAXIS_API_KEY not set. Configure it in Settings or export it in your shell.',
      )
    }
  }

  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'presets', 'pmex')
  const presetIds = ['pmex', 'research', 'copy-trading', 'signals']
  for (const id of presetIds) {
    const dest = join(dshHome(), '.agent-presets', id)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(src, dest, { recursive: true })
  }
}
