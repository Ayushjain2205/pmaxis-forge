/**
 * Agent-scoped GET proxy: /forge/{agent}/* → upstream API.
 * Each agent preset mounts its own proxy with its own API key.
 */

const EXACT = new Set([
  '/v1/markets',
  '/v1/markets/top',
  '/v1/markets/breaking',
  '/v1/markets/resolving',
  '/v1/markets/trending',
  '/v1/markets/new',
  '/v1/markets/search',
  '/v1/markets/compare',
  '/v1/categories',
  '/v1/events',
  '/v1/signals/top',
])

const DETAIL =
  /^\/v1\/markets\/[A-Za-z0-9_-]+(?:\/(?:orderbook|liquidity|stats|summary|candles|trades|related|health|sentiment|price-history))?$/
const CATEGORY_MARKETS = /^\/v1\/categories\/[A-Za-z0-9_-]+\/markets$/
const EVENT_MARKETS = /^\/v1\/events\/[A-Za-z0-9_-]+\/markets$/

export function isAllowedPath(pathname) {
  return EXACT.has(pathname) || DETAIL.test(pathname) || CATEGORY_MARKETS.test(pathname) || EVENT_MARKETS.test(pathname)
}

/**
 * Mount an agent-scoped proxy.
 * @param {object} ctx - DSH context
 * @param {object} opts
 * @param {string} opts.prefix - URL prefix (e.g. '/forge/pmaxis')
 * @param {string} opts.envKey - Environment variable name for the API key
 * @param {string} [opts.fallbackKey] - Fallback env var if primary is not set
 * @param {string} [opts.baseUrl] - Upstream API base URL
 * @param {string} [opts.label] - Human-readable label for error messages
 */
export function mountAgentProxy(ctx, { prefix, envKey, fallbackKey, baseUrl, label }) {
  const base = (baseUrl || process.env.PMAXIS_API_URL || 'https://api.pmaxis.trade').replace(/\/$/, '')
  const key = process.env[envKey] || (fallbackKey ? process.env[fallbackKey] : '') || ''

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: prefix,
        handler: (req, res) => {
          void handle(req, res, { prefix, base, key, label: label || envKey })
        },
      }),
    `forge: ${prefix} proxy`,
  )
}

/**
 * Mount the legacy /forge/pmaxis proxy for backward compatibility.
 */
export function mountPmaxisProxy(ctx) {
  mountAgentProxy(ctx, {
    prefix: '/forge/pmaxis',
    envKey: 'PMAXIS_API_KEY',
    label: 'PMAxis',
  })
}

/**
 * Mount a /forge/agent-keys endpoint that returns key status per agent.
 */
export function mountAgentKeysEndpoint(ctx, agentPresets) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/forge/agent-keys',
        handler: (req, res) => {
          const status = {}
          for (const preset of agentPresets) {
            const key = process.env[preset.envKey] || (preset.fallbackKey ? process.env[preset.fallbackKey] : '')
            status[preset.id] = { configured: Boolean(key) }
          }
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify({ agents: status }))
        },
      }),
    'forge: agent-keys endpoint',
  )
}

async function handle(req, res, { prefix, base, key, label }) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end('method not allowed')
    return
  }

  const url = new URL(req.url || '/', 'http://127.0.0.1')
  if (!url.pathname.startsWith(prefix)) {
    res.writeHead(404)
    res.end('not found')
    return
  }

  const rest = url.pathname.slice(prefix.length) || '/'
  if (!isAllowedPath(rest)) {
    res.writeHead(404)
    res.end('not found')
    return
  }

  if (!key) {
    res.writeHead(503, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: `${label} API key is not set on the host` }))
    return
  }

  try {
    const ac = new AbortController()
    const abort = () => ac.abort()
    req.once('close', abort)
    try {
      const upstream = await fetch(`${base}${rest}${url.search}`, {
        method: 'GET',
        headers: {
          'X-API-Key': key,
          accept: 'application/json',
        },
        signal: ac.signal,
      })
      const body = Buffer.from(await upstream.arrayBuffer())
      const type = upstream.headers.get('content-type') || 'application/json'
      if (res.writableEnded) return
      res.writeHead(upstream.status, {
        'content-type': type,
        'cache-control': 'no-store',
      })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      res.end(body)
    } finally {
      req.off('close', abort)
    }
  } catch (error) {
    if (res.writableEnded) return
    if (error instanceof Error && error.name === 'AbortError') return
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  }
}
