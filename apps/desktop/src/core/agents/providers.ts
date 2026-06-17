// Model-agnostic agent-provider registry. A provider is just a launch recipe + detector.
// Claude Code is the built-in default. mode 'inject' = type the launch line into an
// interactive shell so the user keeps a real, Ctrl-C-able terminal.

import { execFile } from 'node:child_process'
import { composeEnv, whichOn } from '@core/env/shell-path'
import type { AgentProviderInfo } from '@shared/types'

export interface AgentProviderDef {
  id: string
  name: string
  /** candidate binary names, first found wins */
  bins: string[]
  /** the command line injected into the shell to launch the agent */
  launchCommand: string
  versionArgs?: string[]
  mode: 'inject' | 'spawn'
}

export const BUILTIN_PROVIDERS: AgentProviderDef[] = [
  { id: 'claude-code', name: 'Claude Code', bins: ['claude'], launchCommand: 'claude', versionArgs: ['--version'], mode: 'inject' },
  { id: 'aider', name: 'Aider', bins: ['aider'], launchCommand: 'aider', versionArgs: ['--version'], mode: 'inject' },
  { id: 'codex', name: 'Codex CLI', bins: ['codex'], launchCommand: 'codex', versionArgs: ['--version'], mode: 'inject' },
  { id: 'gemini', name: 'Gemini CLI', bins: ['gemini'], launchCommand: 'gemini', versionArgs: ['--version'], mode: 'inject' },
  { id: 'opencode', name: 'opencode', bins: ['opencode'], launchCommand: 'opencode', versionArgs: ['--version'], mode: 'inject' }
]

export const DEFAULT_PROVIDER_ID = 'claude-code'

export function getProviderDef(id: string): AgentProviderDef | undefined {
  return BUILTIN_PROVIDERS.find((p) => p.id === id)
}

function getVersion(
  bin: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 4000, env }, (err, stdout) => {
      if (err) return resolve(null)
      const first = stdout.split('\n')[0]?.trim() ?? ''
      resolve(first || null)
    })
  })
}

export async function detectProviders(): Promise<AgentProviderInfo[]> {
  const allBins = [...new Set(BUILTIN_PROVIDERS.flatMap((p) => p.bins))]
  const composed = await composeEnv(allBins)
  const pathStr = composed.env.PATH ?? ''

  return Promise.all(
    BUILTIN_PROVIDERS.map(async (p) => {
      let binPath: string | null = null
      for (const b of p.bins) {
        const r = composed.resolved[b] ?? whichOn(b, pathStr)
        if (r) {
          binPath = r
          break
        }
      }
      const version =
        binPath && p.versionArgs
          ? await getVersion(binPath, p.versionArgs, composed.env)
          : null
      return {
        id: p.id,
        name: p.name,
        installed: !!binPath,
        path: binPath,
        version,
        isDefault: p.id === DEFAULT_PROVIDER_ID
      } satisfies AgentProviderInfo
    })
  )
}
