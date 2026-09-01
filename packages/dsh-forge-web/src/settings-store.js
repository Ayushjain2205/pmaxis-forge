/**
 * Host-side settings store: reads/writes a JSON file at ~/.dsh/forge-settings.json
 * Single prefix handler at /forge/settings/* that routes by method + path.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const SETTINGS_DIR = join(homedir(), '.dsh')
const SETTINGS_FILE = join(SETTINGS_DIR, 'forge-settings.json')

function ensureDir() {
  if (!existsSync(SETTINGS_DIR)) mkdirSync(SETTINGS_DIR, { recursive: true })
}

function readStore() {
  ensureDir()
  if (!existsSync(SETTINGS_FILE)) return {}
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function writeStore(data) {
  ensureDir()
  writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

/**
 * Resolve the effective value for a tool setting.
 * Priority: agent-specific > global > env var > default
 */
export function resolveToolSetting(agentId, toolId, fieldId, envKey) {
  const store = readStore()
  const agentVal = store[agentId]?.tools?.[toolId]?.[fieldId]
  if (agentVal !== undefined && agentVal !== '') return agentVal
  const globalVal = store._global?.tools?.[toolId]?.[fieldId]
  if (globalVal !== undefined && globalVal !== '') return globalVal
  if (envKey && process.env[envKey]) return process.env[envKey]
  return ''
}

function json(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(data))
}

/**
 * Mount a single prefix handler at /forge/settings that routes all settings requests.
 */
export function mountSettingsStore(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/forge/settings',
        handler: (req, res) => {
          const url = new URL(req.url || '/', 'http://127.0.0.1')
          const rest = url.pathname.slice('/forge/settings'.length) || '/'

          // GET /forge/settings — return full store
          if (rest === '/' && req.method === 'GET') {
            return json(res, 200, readStore())
          }

          // PUT /forge/settings — write full store (merge)
          if (rest === '/' && req.method === 'PUT') {
            let body = ''
            req.on('data', (chunk) => { body += chunk })
            req.on('end', () => {
              try {
                const incoming = JSON.parse(body)
                const current = readStore()
                const merged = deepMerge(current, incoming)
                writeStore(merged)
                json(res, 200, merged)
              } catch (e) {
                json(res, 400, { error: e instanceof Error ? e.message : String(e) })
              }
            })
            return
          }

          // GET /forge/settings/:agentId — return one agent's settings
          const agentId = rest.slice(1).replace(/\/$/, '')
          if (agentId && !agentId.includes('/') && req.method === 'GET') {
            const store = readStore()
            return json(res, 200, store[agentId] || {})
          }

          // PUT /forge/settings/:agentId — write one agent's settings
          if (agentId && !agentId.includes('/') && req.method === 'PUT') {
            let body = ''
            req.on('data', (chunk) => { body += chunk })
            req.on('end', () => {
              try {
                const incoming = JSON.parse(body)
                const current = readStore()
                current[agentId] = deepMerge(current[agentId] || {}, incoming)
                writeStore(current)
                json(res, 200, current[agentId])
              } catch (e) {
                json(res, 400, { error: e instanceof Error ? e.message : String(e) })
              }
            })
            return
          }

          res.writeHead(404)
          res.end('not found')
        },
      }),
    'forge: settings',
  )
}

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}
