// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// The Changes tab: what changed (uncommitted, or since an agent session started / after a
// given turn — via hidden-ref checkpoints), a Monaco diff per file, and the commit → push →
// pull-request flow with a Claude-drafted message. Left: scope + files + commit box. Right:
// the diff. Data comes from core/git over IPC; nothing here touches git directly.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import type { ProjectNode } from '@shared/types'
import type { ChangeSet, ChangedFile, Checkpoint, GitInfo } from '@shared/git'
import { useStore } from '../state/store'
import { ensureMonacoTheme, languageFromPath } from './CodeEditor'

const HEAD = 'HEAD'
const POLL_MS = 6000

// Draft commit messages survive tab switches / project switches (module-level, per repo).
const drafts = new Map<string, string>()

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const STATUS_GLYPH: Record<ChangedFile['status'], string> = { M: 'M', A: 'A', D: 'D', R: 'R', T: 'T' }

/** Read-only Monaco diff editor for one file. Models are swapped when the file changes. */
function DiffView({ original, modified, path, sideBySide }: { original: string; modified: string; path: string; sideBySide: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const edRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const theme = useStore((s) => s.theme)
  const customThemes = useStore((s) => s.customThemes)

  useEffect(() => {
    if (!hostRef.current) return
    const ed = monaco.editor.createDiffEditor(hostRef.current, {
      readOnly: true,
      originalEditable: false,
      renderSideBySide: sideBySide,
      automaticLayout: true,
      fontSize: 12.5,
      fontFamily: 'Menlo, "SF Mono", monospace',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      ignoreTrimWhitespace: false,
      diffWordWrap: 'off',
      theme: ensureMonacoTheme(useStore.getState().theme, useStore.getState().customThemes)
    })
    edRef.current = ed
    return () => {
      const m = ed.getModel()
      ed.dispose()
      m?.original.dispose()
      m?.modified.dispose()
      edRef.current = null
    }
    // The editor is created once; side-by-side + content are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const ed = edRef.current
    if (!ed) return
    const prev = ed.getModel()
    const lang = languageFromPath(path)
    ed.setModel({
      original: monaco.editor.createModel(original, lang),
      modified: monaco.editor.createModel(modified, lang)
    })
    prev?.original.dispose()
    prev?.modified.dispose()
  }, [original, modified, path])

  useEffect(() => {
    edRef.current?.updateOptions({ renderSideBySide: sideBySide })
  }, [sideBySide])

  useEffect(() => {
    monaco.editor.setTheme(ensureMonacoTheme(theme, customThemes))
  }, [theme, customThemes])

  return <div className="diff-host" ref={hostRef} />
}

export function ProjectChanges({ project }: { project: ProjectNode }) {
  const repo = project.path
  const terminals = useStore((s) => s.terminals)
  const pr = useStore((s) => s.prByPath[repo])

  const [info, setInfo] = useState<GitInfo | null>(null)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [base, setBase] = useState<string>(HEAD)
  const [baseTouched, setBaseTouched] = useState(false)
  const [changes, setChanges] = useState<ChangeSet | null>(null)
  const [loading, setLoading] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [diff, setDiff] = useState<{ path: string; original: string; modified: string; binary: boolean } | null>(null)
  const [sideBySide, setSideBySide] = useState(true)
  const [message, setMessage] = useState(drafts.get(repo) ?? '')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [draftPr, setDraftPr] = useState(false)
  const [prOpen, setPrOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // ----- loading -----

  const loadInfo = useCallback(async () => {
    setInfo(await window.api.git.info(repo))
  }, [repo])

  const loadCheckpoints = useCallback(async () => {
    const live = Object.keys(useStore.getState().terminals)
    await window.api.git.pruneCheckpoints(repo, live)
    const all = await window.api.git.checkpoints(repo)
    const mine = new Set(Object.values(useStore.getState().terminals).filter((t) => t.cwd === repo).map((t) => t.id))
    setCheckpoints(all.filter((c) => mine.has(c.terminalId)))
  }, [repo])

  const loadChanges = useCallback(
    async (b: string) => {
      setLoading(true)
      try {
        const cs = await window.api.git.changes(repo, b)
        setChanges(cs)
      } finally {
        setLoading(false)
      }
    },
    [repo]
  )

  const refreshAll = useCallback(async () => {
    await Promise.all([loadInfo(), loadCheckpoints(), loadChanges(base)])
    void useStore.getState().loadGit(repo)
  }, [loadInfo, loadCheckpoints, loadChanges, base, repo])

  useEffect(() => {
    void refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  useEffect(() => {
    void loadChanges(base)
  }, [base, loadChanges])

  // Poll while visible so an agent's edits show up as it works; also on window focus.
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadChanges(base)
    }, POLL_MS)
    const onFocus = (): void => void refreshAll()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', onFocus)
    }
  }, [base, loadChanges, refreshAll])

  // New checkpoints appear when an agent starts / finishes a turn — re-list on those signals.
  const agentSignature = useMemo(
    () =>
      Object.values(terminals)
        .filter((t) => t.cwd === repo && t.kind === 'agent')
        .map((t) => `${t.id}:${t.status}`)
        .join('|'),
    [terminals, repo]
  )
  useEffect(() => {
    const t = setTimeout(() => void loadCheckpoints(), 800)
    return () => clearTimeout(t)
  }, [agentSignature, loadCheckpoints])

  // Default scope: the most recent agent session's start, once we know about it.
  useEffect(() => {
    if (baseTouched || checkpoints.length === 0) return
    const starts = checkpoints.filter((c) => c.seq === 0)
    const latest = starts[starts.length - 1]
    if (latest) setBase(latest.sha)
  }, [checkpoints, baseTouched])

  // PR lookup for the header badge.
  useEffect(() => {
    if (info?.isGithub && info.branch) void useStore.getState().loadPr(repo, info.branch)
  }, [repo, info?.isGithub, info?.branch])

  // Keep the selected file valid; load its diff.
  useEffect(() => {
    if (!changes) return
    if (selected && !changes.files.some((f) => f.path === selected)) setSelected(null)
  }, [changes, selected])

  useEffect(() => {
    if (!changes || !selected) {
      setDiff(null)
      return
    }
    const file = changes.files.find((f) => f.path === selected)
    if (!file) return
    let cancelled = false
    void window.api.git.fileDiff(repo, changes.base, changes.tree, file).then((d) => {
      if (!cancelled) setDiff({ path: file.path, ...d })
    })
    return () => {
      cancelled = true
    }
  }, [changes, selected, repo])

  useEffect(() => {
    drafts.set(repo, message)
  }, [message, repo])

  // ----- derived -----

  const files = changes?.files ?? []
  const included = files.filter((f) => !excluded.has(f.path))
  const hasChanges = files.length > 0
  const allIncluded = included.length === files.length
  const totals = files.reduce((a, f) => ({ add: a.add + f.added, del: a.del + f.deleted }), { add: 0, del: 0 })
  const onDefault = !!info?.branch && info.branch === info.defaultBranch
  const canPr = !!info?.isGithub && !!info.ghReady && !pr && !onDefault
  const baseIsCheckpoint = base !== HEAD
  const scopeLabel = (c: Checkpoint): string => {
    const tab = terminals[c.terminalId]
    const who = tab?.title ?? 'agent'
    return c.seq === 0 ? `Since ${who} started · ${fmtTime(c.at)}` : `${who} · after turn ${c.seq} · ${fmtTime(c.at)}`
  }

  // ----- actions -----

  const withBusy = async (label: string, fn: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(label)
    setNote(null)
    try {
      await fn()
    } catch (e) {
      setNote({ kind: 'err', text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const generate = (): Promise<void> =>
    withBusy('generate', async () => {
      // Describe what will be committed (everything uncommitted), whatever scope is viewed.
      const cs = changes && changes.base === HEAD ? changes : await window.api.git.changes(repo, HEAD)
      if (!cs.tree || cs.files.length === 0) throw new Error('Nothing uncommitted to describe.')
      const g = await window.api.git.generate(repo, cs.base, cs.tree)
      if (!g.ok) throw new Error(g.error ?? 'Could not draft a message.')
      setMessage(g.commitBody ? `${g.commitSubject}\n\n${g.commitBody}` : g.commitSubject ?? '')
      setPrTitle(g.prTitle ?? g.commitSubject ?? '')
      setPrBody(g.prBody ?? '')
      setNote({ kind: 'ok', text: 'Drafted by Claude — edit freely.' })
    })

  const doCommit = async (): Promise<string> => {
    const r = await window.api.git.commit(repo, message, allIncluded ? null : included.map((f) => f.path))
    if (!r.ok) throw new Error(r.error ?? 'Commit failed.')
    setMessage('')
    setExcluded(new Set())
    return r.value ?? ''
  }

  const doPush = async (): Promise<void> => {
    const r = await window.api.git.push(repo)
    if (!r.ok) throw new Error(r.error ?? 'Push failed.')
  }

  const doPr = async (): Promise<string> => {
    const title = prTitle.trim() || message.split('\n')[0]?.trim() || ''
    const body = prBody.trim() || message.split('\n').slice(1).join('\n').trim()
    const r = await window.api.git.createPr(repo, { title, body, draft: draftPr, base: info?.defaultBranch })
    if (!r.ok) throw new Error(r.error ?? 'Could not create the pull request.')
    return r.value ?? ''
  }

  const commitOnly = (): Promise<void> =>
    withBusy('commit', async () => {
      const sha = await doCommit()
      setNote({ kind: 'ok', text: `Committed ${sha}.` })
      await refreshAll()
    })

  const commitPush = (): Promise<void> =>
    withBusy('push', async () => {
      const sha = hasChanges ? await doCommit() : ''
      await doPush()
      setNote({ kind: 'ok', text: sha ? `Committed ${sha} and pushed.` : 'Pushed.' })
      await refreshAll()
    })

  const commitPushPr = (): Promise<void> =>
    withBusy('pr', async () => {
      const sha = hasChanges ? await doCommit() : ''
      await doPush()
      const url = await doPr()
      setNote({ kind: 'ok', text: `${sha ? `Committed ${sha}, pushed, ` : 'Pushed, '}PR created.` })
      if (url.startsWith('http')) window.api.shell.openExternal(url)
      await refreshAll()
      if (info?.branch) void useStore.getState().loadPr(repo, info.branch)
    })

  const revert = (): Promise<void> =>
    withBusy('revert', async () => {
      const cp = checkpoints.find((c) => c.sha === base)
      if (!cp) throw new Error('Pick a checkpoint first.')
      const r = await window.api.git.revert(repo, cp.ref)
      if (!r.ok) {
        if (r.error === 'cancelled') return
        throw new Error(r.error ?? 'Revert failed.')
      }
      setNote({ kind: 'ok', text: 'Working tree restored to the checkpoint.' })
      await refreshAll()
    })

  const openInEditor = (): void => {
    if (!selected) return
    useStore.getState().setDetailMode('editor')
    window.dispatchEvent(new CustomEvent('cz:open-file', { detail: { projectId: project.id, path: `${repo}/${selected}` } }))
  }

  const toggleExcluded = (p: string): void =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })

  // ----- render -----

  if (info && !info.isRepo) {
    return <div className="changes-empty muted">Not a git repository.</div>
  }

  const prBadge = pr ? (
    <button
      className={`tpr ${pr.state.toLowerCase()} ${pr.isDraft ? 'draft' : ''}`}
      title={`${pr.title}\n${pr.url}`}
      onClick={() => window.api.shell.openExternal(pr.url)}
    >
      {pr.isDraft ? '◌' : pr.state === 'MERGED' ? '⛙' : pr.state === 'CLOSED' ? '⊘' : '⎇'} PR #{pr.number}
      {pr.state !== 'OPEN' ? ` · ${pr.state.toLowerCase()}` : pr.isDraft ? ' · draft' : ''}
    </button>
  ) : null

  return (
    <div className="changes">
      <div className="changes-side">
        <div className="changes-head">
          <span className="wt-branch" title={info?.upstream ? `tracking ${info.upstream}` : 'no upstream yet'}>
            ⎇ {info?.branch ?? '…'}
          </span>
          {info && (info.ahead > 0 || info.behind > 0) && (
            <span className="muted small">
              {info.ahead ? `↑${info.ahead}` : ''}
              {info.ahead && info.behind ? ' ' : ''}
              {info.behind ? `↓${info.behind}` : ''}
            </span>
          )}
          <span className="spacer" />
          {prBadge}
          <button className="mini" title="Refresh" disabled={loading} onClick={() => void refreshAll()}>
            ↻
          </button>
        </div>

        <div className="changes-scope">
          <select
            className="select"
            value={base}
            onChange={(e) => {
              setBaseTouched(true)
              setBase(e.target.value)
            }}
            title="What to compare the working tree against"
          >
            <option value={HEAD}>Uncommitted changes (vs HEAD)</option>
            {checkpoints.map((c) => (
              <option key={c.ref} value={c.sha}>
                {scopeLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <div className="changes-files">
          {files.length === 0 && (
            <div className="changes-none muted small">
              {loading ? 'Looking…' : baseIsCheckpoint ? 'Nothing changed since this checkpoint.' : 'Working tree clean.'}
            </div>
          )}
          {files.map((f) => (
            <div
              key={f.path}
              className={`cfile ${selected === f.path ? 'sel' : ''} ${excluded.has(f.path) ? 'off' : ''}`}
              onClick={() => setSelected(f.path)}
              title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
            >
              {!baseIsCheckpoint && (
                <input
                  type="checkbox"
                  className="cfile-check"
                  checked={!excluded.has(f.path)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleExcluded(f.path)}
                  title="Include in the commit"
                />
              )}
              <span className={`cfile-st st-${f.status}`}>{STATUS_GLYPH[f.status]}</span>
              <span className="cfile-path">
                <span className="cfile-dir">{f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : ''}</span>
                {f.path.slice(f.path.lastIndexOf('/') + 1)}
              </span>
              <span className="cfile-nums">
                {f.binary ? <span className="muted">bin</span> : (
                  <>
                    <span className="add">+{f.added}</span> <span className="del">−{f.deleted}</span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="changes-foot muted small">
          {files.length} file{files.length === 1 ? '' : 's'}
          {files.length > 0 && (
            <>
              {' · '}
              <span className="add">+{totals.add}</span> <span className="del">−{totals.del}</span>
            </>
          )}
          {!allIncluded && ` · ${included.length} selected`}
        </div>

        {baseIsCheckpoint && (
          <div className="changes-revert">
            <button className="ghost danger" disabled={!!busy || files.length === 0} onClick={() => void revert()}>
              {busy === 'revert' ? 'Reverting…' : '⟲ Revert to this checkpoint'}
            </button>
          </div>
        )}

        <div className="changes-commit">
          <textarea
            className="commit-msg"
            placeholder={hasChanges ? 'Commit message' : info && info.ahead > 0 ? 'Nothing to commit — push when ready' : 'Nothing to commit'}
            value={message}
            disabled={!!busy}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && hasChanges && message.trim()) void commitOnly()
            }}
            rows={3}
          />
          <div className="commit-row">
            <button
              className="ghost"
              disabled={!!busy || !hasChanges}
              onClick={() => void generate()}
              title="Draft the commit message and PR text from the diff with Claude Code (headless)"
            >
              {busy === 'generate' ? '✨ Drafting…' : '✨ Draft with Claude'}
            </button>
            {canPr && (
              <button className={`ghost ${prOpen ? 'on' : ''}`} onClick={() => setPrOpen((o) => !o)} title="Edit the pull request title / body">
                PR text {prOpen ? '▴' : '▾'}
              </button>
            )}
          </div>
          {canPr && prOpen && (
            <div className="pr-fields">
              <input className="select" placeholder="Pull request title (defaults to the commit subject)" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
              <textarea className="commit-msg" placeholder="Pull request body (Markdown)" rows={5} value={prBody} onChange={(e) => setPrBody(e.target.value)} />
              <label className="small muted pr-draft">
                <input type="checkbox" checked={draftPr} onChange={(e) => setDraftPr(e.target.checked)} /> Open as draft
              </label>
            </div>
          )}
          <div className="commit-actions">
            <button className="primary" disabled={!!busy || !hasChanges || !message.trim()} onClick={() => void commitOnly()} title="⌘↩">
              {busy === 'commit' ? 'Committing…' : 'Commit'}
            </button>
            <button
              className="primary"
              disabled={!!busy || (hasChanges ? !message.trim() : !(info && info.ahead > 0)) || !info?.remoteUrl}
              onClick={() => void commitPush()}
              title={info?.remoteUrl ? `push to ${info.upstream ?? `origin/${info.branch ?? ''}`}` : 'No origin remote'}
            >
              {busy === 'push' ? 'Pushing…' : hasChanges ? 'Commit & push' : pr ? `Push to PR #${pr.number}` : 'Push'}
            </button>
            {canPr && (
              <button
                className="primary accent"
                disabled={!!busy || (hasChanges && !message.trim())}
                onClick={() => void commitPushPr()}
                title={`Commit, push and open a pull request against ${info?.defaultBranch ?? 'the default branch'}`}
              >
                {busy === 'pr' ? 'Creating PR…' : hasChanges ? 'Commit, push & PR' : 'Push & create PR'}
              </button>
            )}
          </div>
          {info?.isGithub && !info.ghReady && info.ghHint && (
            <div className="muted small changes-hint">{info.ghHint}</div>
          )}
          {info && !info.isGithub && info.remoteUrl && (
            <div className="muted small changes-hint">Pull requests need a GitHub remote.</div>
          )}
          {note && <div className={`changes-note ${note.kind}`}>{note.text}</div>}
        </div>
      </div>

      <div className="changes-main">
        {diff ? (
          <>
            <div className="editor-head">
              <span className="editor-path">{diff.path}</span>
              <span className="diff-tools">
                <button className={`mini ${sideBySide ? 'on' : ''}`} onClick={() => setSideBySide(true)}>Split</button>
                <button className={`mini ${!sideBySide ? 'on' : ''}`} onClick={() => setSideBySide(false)}>Unified</button>
                <button className="mini" onClick={openInEditor}>Open in editor</button>
              </span>
            </div>
            {diff.binary ? (
              <div className="changes-empty muted">Binary file — no text diff.</div>
            ) : (
              <DiffView original={diff.original} modified={diff.modified} path={diff.path} sideBySide={sideBySide} />
            )}
          </>
        ) : (
          <div className="changes-empty muted">
            {files.length ? 'Select a file to see its diff.' : baseIsCheckpoint ? 'No changes since this checkpoint.' : 'Nothing to show — the working tree is clean.'}
          </div>
        )}
      </div>
    </div>
  )
}
