// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useState } from 'react'
import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'

// Banner shown at the top of the detail pane when the selected node is a git worktree:
// identifies the branch + main project and offers the two exits — merge back or discard.
// Confirmation happens in the main process (native dialog); errors surface inline here.
export function WorktreeBar({ project }: { project: ProjectNode }) {
  const parent = useStore((s) => s.findProject(project.worktreeOf ?? null))
  const [busy, setBusy] = useState<'merge' | 'remove' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = async (kind: 'merge' | 'remove'): Promise<void> => {
    setBusy(kind)
    setErr(null)
    const e =
      kind === 'merge'
        ? await useStore.getState().mergeWorktree(project)
        : await useStore.getState().removeWorktree(project)
    setBusy(null)
    if (e) setErr(e)
  }

  return (
    <div className="wt-bar">
      <span className="wt-branch" title={project.path}>
        ⎇ {project.branch ?? project.name}
      </span>
      <span className="muted small">worktree of {parent?.name ?? '…'}</span>
      {err && <span className="err wt-err" title={err}>{err}</span>}
      <span className="spacer" />
      <button className="ghost" disabled={!!busy} onClick={() => void run('merge')}>
        {busy === 'merge' ? 'Merging…' : '⇤ Merge & remove'}
      </button>
      <button className="ghost" disabled={!!busy} onClick={() => void run('remove')}>
        {busy === 'remove' ? 'Removing…' : '✕ Discard'}
      </button>
    </div>
  )
}
