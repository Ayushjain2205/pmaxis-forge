/**
 * Copies the shipped `pmex` agent preset into the harness user-preset root
 * so the profile default (`pmex`) resolves without a hardcoded profile path.
 */
import { cpSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-pmaxis-preset'

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export const apply = () => {
  if (!process.env.PMAXIS_API_KEY) {
    throw new Error(
      'PMAXIS_API_KEY is required. Export it before running `dsh --profile pmex`.',
    )
  }

  const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'presets', 'pmex')
  const dest = join(dshHome(), '.agent-presets', 'pmex')
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
}
