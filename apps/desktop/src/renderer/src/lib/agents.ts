// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Shared agent-launch helpers (used by the terminal deck and the worktree flow).

import type { AgentProviderInfo, ProjectNode } from '@shared/types'

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
    agents.find((a) => a.isDefault) ??
    agents.find((a) => a.installed)
  )
}

/** newTerminal() options for launching a project's agent (optionally `--continue`). */
export function agentLaunchOpts(
  agents: AgentProviderInfo[],
  project: ProjectNode | undefined,
  resume = false
): { kind: 'agent'; providerId?: string; title: string; initialCommand: string } {
  const prov = resolveProvider(agents, project)
  const pid = prov?.id ?? 'claude-code'
  const base = launchCommandFor(pid)
  return {
    kind: 'agent',
    providerId: prov?.id,
    title: resume ? 'Claude ↻' : prov?.name ?? 'Claude',
    initialCommand: resume && pid === 'claude-code' ? `${base} --continue` : base
  }
}
