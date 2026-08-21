/**
 * Forge desk web-runtime: provides webRuntime, serves apps/desk dist,
 * prints the local URL, opens the browser, mounts the PMAxis GET proxy.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import * as FrontendStatic from '@deepseek-ai/dsh-host-frontend-static'
import open from 'open'
import { mountPmaxisProxy } from './pmaxis-proxy.js'

export const name = 'dsh-forge-web'
export const inject = ['webServer']

const WEB_RUNTIME_SERVICE = 'webRuntime'
const LOOPBACK_HOST = '127.0.0.1'

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
  mountPmaxisProxy(ctx)

  const handoffBrowser = config.openBrowser
  if (config.printUrl || handoffBrowser) {
    const announceReady = () => {
      const webUrl = localWebUrl(ctx)
      if (config.printUrl) console.log(`forge: ${webUrl}`)
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
