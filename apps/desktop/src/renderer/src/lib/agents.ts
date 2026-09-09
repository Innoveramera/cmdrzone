// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Shared agent-launch helpers (used by the terminal deck and the worktree flow).

import type { AgentProviderInfo, PermissionMode, ProjectNode } from '@shared/types'

/** The four permission modes, in the order the picker shows them. */
export const PERMISSION_MODES: { id: PermissionMode; label: string; glyph: string; description: string }[] = [
  { id: 'supervised', label: 'Supervised', glyph: '', description: 'The agent asks before commands and file changes (the CLI default).' },
  { id: 'acceptEdits', label: 'Auto-accept edits', glyph: '✎', description: 'File edits go through without asking; commands still prompt.' },
  { id: 'plan', label: 'Plan', glyph: '☰', description: 'Read-only: the agent plans and explains, but changes nothing until you switch.' },
  { id: 'full', label: 'Full access', glyph: '⚡', description: 'No approval prompts at all — commands and edits run straight away.' }
]

export function isPermissionMode(v: unknown): v is PermissionMode {
  return v === 'supervised' || v === 'acceptEdits' || v === 'plan' || v === 'full'
}

/**
 * The CLI flags that put a provider into a permission mode. Empty when the provider has no
 * equivalent (it then runs in its own default = supervised). Flags go BEFORE any positional
 * prompt argument.
 */
export function permissionFlags(providerId: string | undefined, mode: PermissionMode | undefined): string[] {
  if (!mode || mode === 'supervised') return []
  switch (providerId) {
    case 'claude-code':
      return mode === 'full'
        ? ['--dangerously-skip-permissions']
        : ['--permission-mode', mode === 'plan' ? 'plan' : 'acceptEdits']
    case 'codex':
      // Codex has no plan-only mode; "auto-accept edits" maps to its workspace-write auto mode.
      return mode === 'full' ? ['--dangerously-bypass-approvals-and-sandbox'] : mode === 'acceptEdits' ? ['--full-auto'] : []
    case 'gemini':
      return mode === 'full' ? ['--yolo'] : mode === 'acceptEdits' ? ['--approval-mode', 'auto_edit'] : []
    case 'aider':
      return mode === 'full' ? ['--yes-always'] : []
    default:
      return []
  }
}

/** Whether a provider can honor the mode at all (drives the picker's per-option hint). */
export function supportsPermissionMode(providerId: string | undefined, mode: PermissionMode): boolean {
  return mode === 'supervised' || permissionFlags(providerId, mode).length > 0
}

export function launchCommandFor(id?: string): string {
  switch (id) {
    case 'aider':
      return 'aider'
    case 'codex':
      return 'codex'
    case 'gemini':
      return 'gemini'
    case 'opencode':
      return 'opencode'
    case 'claude-code':
    default:
      return 'claude'
  }
}

/** The provider to launch for a project: its override → the app default → anything installed. */
export function resolveProvider(
  agents: AgentProviderInfo[],
  project?: ProjectNode
): AgentProviderInfo | undefined {
  const wantId = project?.defaultProviderId ?? 'claude-code'
  return (
    agents.find((a) => a.id === wantId && a.installed) ??
    agents.find((a) => a.isDefault && a.installed) ??
    agents.find((a) => a.installed)
  )
}

/** newTerminal() options for launching a project's agent (optionally `--continue`). */
export function agentLaunchOpts(
  agents: AgentProviderInfo[],
  project: ProjectNode | undefined,
  resume = false,
  mode: PermissionMode | undefined = project?.permissionMode
): { kind: 'agent'; providerId?: string; title: string; initialCommand: string; permissionMode?: PermissionMode } {
  const prov = resolveProvider(agents, project)
  return providerLaunchOpts(prov ?? { id: 'claude-code', name: 'Claude' }, resume, mode)
}

/** Launch the explicitly chosen agent, independent of the project's default. */
export function providerLaunchOpts(
  provider: Pick<AgentProviderInfo, 'id' | 'name'>,
  resume = false,
  mode?: PermissionMode
): { kind: 'agent'; providerId: string; title: string; initialCommand: string; permissionMode?: PermissionMode } {
  const base = launchCommandFor(provider.id)
  const continueClaude = resume && provider.id === 'claude-code'
  const flags = permissionFlags(provider.id, mode)
  const cmd = [base, ...(continueClaude ? ['--continue'] : []), ...flags].join(' ')
  return {
    kind: 'agent',
    providerId: provider.id,
    title: continueClaude ? `${provider.name} ↻` : provider.name,
    initialCommand: cmd,
    permissionMode: flags.length ? mode : undefined
  }
}
