/** Allow-listed GET proxy: /forge/pmaxis/* → api.pmaxis.trade. Key stays on the host. */

const PREFIX = '/forge/pmaxis'

const EXACT = new Set([
  '/v1/markets',
  '/v1/markets/top',
  '/v1/markets/breaking',
  '/v1/markets/resolving',
  '/v1/markets/trending',
  '/v1/markets/new',
  '/v1/markets/search',
  '/v1/categories',
])

const DETAIL = /^\/v1\/markets\/[A-Za-z0-9_-]+(?:\/(?:orderbook|liquidity|stats|summary))?$/
const CATEGORY_MARKETS = /^\/v1\/categories\/[A-Za-z0-9_-]+\/markets$/

export function isAllowedPath(pathname) {
  return EXACT.has(pathname) || DETAIL.test(pathname) || CATEGORY_MARKETS.test(pathname)
}

export function mountPmaxisProxy(ctx) {
  const base = (process.env.PMAXIS_API_URL || 'https://api.pmaxis.trade').replace(/\/$/, '')
  const key = process.env.PMAXIS_API_KEY || ''

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: (req, res) => {
          void handle(req, res, base, key)
        },
      }),
    'forge: /forge/pmaxis proxy',
  )
}

async function handle(req, res, base, key) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end('method not allowed')
    return
  }

  const url = new URL(req.url || '/', 'http://127.0.0.1')
  if (!url.pathname.startsWith(PREFIX)) {
    res.writeHead(404)
    res.end('not found')
    return
  }

  const rest = url.pathname.slice(PREFIX.length) || '/'
  if (!isAllowedPath(rest)) {
    res.writeHead(404)
    res.end('not found')
    return
  }

  if (!key) {
    res.writeHead(503, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'PMAXIS_API_KEY is not set on the host' }))
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
