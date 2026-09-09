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
    agents.find((a) => a.isDefault && a.installed) ??
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
  return providerLaunchOpts(prov ?? { id: 'claude-code', name: 'Claude' }, resume)
}

/** Launch the explicitly chosen agent, independent of the project's default. */
export function providerLaunchOpts(
  provider: Pick<AgentProviderInfo, 'id' | 'name'>,
  resume = false
): { kind: 'agent'; providerId: string; title: string; initialCommand: string } {
  const base = launchCommandFor(provider.id)
  const continueClaude = resume && provider.id === 'claude-code'
  return {
    kind: 'agent',
    providerId: provider.id,
    title: continueClaude ? `${provider.name} ↻` : provider.name,
    initialCommand: continueClaude ? `${base} --continue` : base
  }
}
