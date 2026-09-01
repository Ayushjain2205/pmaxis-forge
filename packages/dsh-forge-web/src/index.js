/**
 * Forge desk web-runtime: provides webRuntime, serves apps/desk dist,
 * prints the local URL, opens the browser, mounts agent-scoped proxies.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import * as FrontendStatic from '@deepseek-ai/dsh-host-frontend-static'
import open from 'open'
import { mountAgentProxy, mountAgentKeysEndpoint, mountPmaxisProxy } from './pmaxis-proxy.js'
import { mountSettingsStore, resolveToolSetting } from './settings-store.js'
import { TOOL_DEFINITIONS, TOOL_DEFINITIONS_GLOBAL } from './tool-definitions.js'

export const name = 'dsh-forge-web'
export const inject = ['webServer']

const WEB_RUNTIME_SERVICE = 'webRuntime'
const LOOPBACK_HOST = '127.0.0.1'

/** Agent presets with their proxy config */
const AGENT_PRESETS = [
  {
    id: 'research',
    name: 'Research',
    prefix: '/forge/pmaxis',
    envKey: 'PMAXIS_API_KEY_RESEARCH',
    fallbackKey: 'PMAXIS_API_KEY',
    label: 'PMAxis',
  },
  {
    id: 'copy-trading',
    name: 'Copy Trading',
    prefix: '/forge/copy-trading',
    envKey: 'PMAXIS_API_KEY_COPY_TRADING',
    fallbackKey: 'PMAXIS_API_KEY',
    label: 'PMAxis',
  },
  {
    id: 'signals',
    name: 'Signals',
    prefix: '/forge/signals',
    envKey: 'PMAXIS_API_KEY_SIGNALS',
    fallbackKey: 'PMAXIS_API_KEY',
    label: 'PMAxis',
  },
]

export const Config = z.object({
  openBrowser: z.boolean().default(true),
  printUrl: z.boolean().default(true),
  trustedHosts: z.array(String).default([]),
})

function packageRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

function resolveDistIndex() {
  const bundled = join(packageRoot(), 'dist', 'index.html')
  if (existsSync(bundled)) return bundled
  throw new Error(
    'dsh-forge-web: desk dist missing. From the repo run `pnpm --filter desk build` then retry `dsh --profile pmex`.',
  )
}

function localWebUrl(ctx) {
  const port = ctx.get('webServer')?.port
  if (port === undefined) throw new Error('dsh-forge-web: webServer missing while resolving URL')
  return `http://${LOOPBACK_HOST}:${String(port)}`
}

export function apply(ctx, config) {
  const runtime = {
    lanAddresses: [],
    trustedHosts: config.trustedHosts ?? [],
  }
  ctx.provide(WEB_RUNTIME_SERVICE, runtime)
  ctx.plugin(FrontendStatic, { distIndex: resolveDistIndex() })

  /** Mount proxies for each agent preset */
  for (const preset of AGENT_PRESETS) {
    mountAgentProxy(ctx, {
      prefix: preset.prefix,
      envKey: preset.envKey,
      fallbackKey: preset.fallbackKey,
      agentId: preset.id,
      label: preset.label,
      resolveKey: (agentId, toolId, fieldId, envKey, fallbackKey) =>
        resolveToolSetting(agentId, toolId, fieldId, envKey) ||
        resolveToolSetting(agentId, toolId, fieldId, fallbackKey) ||
        process.env[envKey] ||
        process.env[fallbackKey] ||
        '',
    })
  }

  /** Mount agent key status endpoint */
  mountAgentKeysEndpoint(ctx, AGENT_PRESETS)

  /** Mount settings store */
  mountSettingsStore(ctx)

  /** Mount tool definitions endpoint */
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/forge/tool-definitions',
        handler: (req, res) => {
          if (req.method !== 'GET') {
            res.writeHead(405)
            res.end('method not allowed')
            return
          }
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          })
          res.end(JSON.stringify({ agents: TOOL_DEFINITIONS, global: TOOL_DEFINITIONS_GLOBAL }))
        },
      }),
    'forge: tool-definitions endpoint',
  )

  const handoffBrowser = config.openBrowser
  if (config.printUrl || handoffBrowser) {
    const announceReady = () => {
      const webUrl = localWebUrl(ctx)
      if (config.printUrl) {
        console.log(`forge: ${webUrl}`)
        console.log(`forge: agent proxies:`)
        for (const preset of AGENT_PRESETS) {
          const key = process.env[preset.envKey] || process.env[preset.fallbackKey]
          console.log(`  ${preset.name}: ${preset.prefix} (${key ? 'key set' : 'NO KEY'})`)
        }
      }
      if (handoffBrowser) {
        console.log('forge: opening the default browser; pass --no-open to disable')
        open(webUrl).catch((error) => {
          const reason = error instanceof Error ? error.message : String(error)
          console.error(`forge: could not open the browser because ${reason}; visit ${webUrl} manually`)
        })
      }
    }
    const settled = ctx.get('loader')?.await()
    if (settled === undefined) announceReady()
    else
      settled.then(
        () => {
          if (ctx.get('webServer') !== undefined) announceReady()
        },
        () => {},
      )
  }
}
