/**
 * Host-side settings store: reads/writes a JSON file at ~/.dsh/forge-settings.json
 * Exposes HTTP endpoints for the frontend to read/write per-agent, per-tool settings.
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
  // agent-specific
  const agentVal = store[agentId]?.tools?.[toolId]?.[fieldId]
  if (agentVal !== undefined && agentVal !== '') return agentVal
  // global
  const globalVal = store._global?.tools?.[toolId]?.[fieldId]
  if (globalVal !== undefined && globalVal !== '') return globalVal
  // env var fallback
  if (envKey && process.env[envKey]) return process.env[envKey]
  return ''
}

/**
 * Mount the settings API endpoints on the web server.
 */
export function mountSettingsStore(ctx) {
  // GET /forge/settings — return full store
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/forge/settings',
        handler: (req, res) => {
          if (req.method !== 'GET') {
            res.writeHead(405, { allow: 'GET, PUT' })
            res.end('method not allowed')
            return
          }
          const data = readStore()
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify(data))
        },
      }),
    'forge: settings GET',
  )

  // PUT /forge/settings — write full store (or merge)
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/forge/settings',
        handler: (req, res) => {
          if (req.method !== 'PUT') {
            res.writeHead(405, { allow: 'GET, PUT' })
            res.end('method not allowed')
            return
          }
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const incoming = JSON.parse(body)
              const current = readStore()
              const merged = deepMerge(current, incoming)
              writeStore(merged)
              res.writeHead(200, { 'content-type': 'application/json' })
              res.end(JSON.stringify(merged))
            } catch (e) {
              res.writeHead(400, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
            }
          })
        },
      }),
    'forge: settings PUT',
  )

  // GET /forge/settings/:agentId — return one agent's settings
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: '/forge/settings/',
        handler: (req, res) => {
          const url = new URL(req.url || '/', 'http://127.0.0.1')
          const agentId = url.pathname.slice('/forge/settings/'.length)
          if (!agentId || agentId.includes('/')) {
            res.writeHead(404)
            res.end('not found')
            return
          }
          if (req.method !== 'GET') {
            res.writeHead(405, { allow: 'GET, PUT' })
            res.end('method not allowed')
            return
          }
          const store = readStore()
          const agentSettings = store[agentId] || {}
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify(agentSettings))
        },
      }),
    'forge: settings per-agent GET',
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
