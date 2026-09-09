// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// The commit → push → pull-request flow, plus the repo facts the Changes tab needs to decide
// which buttons to show. `gh` (GitHub CLI) does the PR work — same approach as T3 Code's
// source-control integration: the user authenticates once with `gh auth login`, we shell out.
// No electron imports (main-safe core).

import type { GitInfo, GitOpResult, PrInfo } from '@shared/git'
import { git, run } from './run'

let ghCache: { at: number; ready: boolean; hint?: string } | null = null

/** `gh auth status` is slow-ish (network); cache the verdict for a minute. */
async function ghStatus(repo: string, env: NodeJS.ProcessEnv): Promise<{ ready: boolean; hint?: string }> {
  if (ghCache && Date.now() - ghCache.at < 60_000) return ghCache
  const r = await run('gh', ['auth', 'status', '--hostname', 'github.com'], { cwd: repo, env, timeout: 15_000 })
  let ready = r.ok
  let hint: string | undefined
  if (!r.ok) {
    hint = /ENOENT|not found/i.test(r.err)
      ? 'Install GitHub CLI (brew install gh) and run `gh auth login`.'
      : 'Run `gh auth login` in a terminal to enable pull requests.'
    ready = false
  }
  ghCache = { at: Date.now(), ready, hint }
  return ghCache
}

export async function gitInfo(repo: string, env: NodeJS.ProcessEnv): Promise<GitInfo> {
  const st = await git(repo, ['status', '--porcelain=v2', '--branch'], env)
  if (!st.ok) return { isRepo: false, ahead: 0, behind: 0, isGithub: false, ghReady: false }
  let branch: string | undefined
  let upstream: string | undefined
  let ahead = 0
  let behind = 0
  for (const line of st.out.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14).trim()
    else if (line.startsWith('# branch.upstream ')) upstream = line.slice(18).trim()
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+)\s+-(\d+)/.exec(line)
      if (m) {
        ahead = parseInt(m[1]!, 10)
        behind = parseInt(m[2]!, 10)
      }
    }
  }
  if (branch === '(detached)') branch = undefined
  const remote = await git(repo, ['remote', 'get-url', 'origin'], env)
  const remoteUrl = remote.ok ? remote.out.trim() : undefined
  const isGithub = !!remoteUrl && /github\.com[:/]/i.test(remoteUrl)
  let defaultBranch: string | undefined
  const sym = await git(repo, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], env)
  if (sym.ok && sym.out.trim()) defaultBranch = sym.out.trim().replace(/^origin\//, '')
  else {
    for (const cand of ['main', 'master']) {
      const r = await git(repo, ['rev-parse', '--verify', '-q', `refs/heads/${cand}`], env)
      if (r.ok) {
        defaultBranch = cand
        break
      }
    }
  }
  const gh = isGithub ? await ghStatus(repo, env) : { ready: false }
  return { isRepo: true, branch, upstream, ahead, behind, remoteUrl, isGithub, defaultBranch, ghReady: gh.ready, ghHint: gh.hint }
}

/** Stage (all changes, or just `paths`) and commit. Resolves the new commit's sha. */
export async function commit(
  repo: string,
  message: string,
  paths: string[] | null,
  env: NodeJS.ProcessEnv
): Promise<GitOpResult> {
  const msg = message.trim()
  if (!msg) return { ok: false, error: 'Write a commit message first.' }
  const add = paths && paths.length
    ? await git(repo, ['add', '-A', '--', ...paths], env, { timeout: 60_000 })
    : await git(repo, ['add', '-A', '--', '.'], env, { timeout: 60_000 })
  if (!add.ok) return { ok: false, error: add.err }
  const staged = await git(repo, ['diff', '--cached', '--quiet'], env)
  if (staged.ok) return { ok: false, error: 'Nothing to commit.' }
  const c = await git(repo, ['commit', '-F', '-'], env, { input: msg + '\n', timeout: 60_000 })
  if (!c.ok) return { ok: false, error: c.err }
  const sha = await git(repo, ['rev-parse', '--short', 'HEAD'], env)
  return { ok: true, value: sha.ok ? sha.out.trim() : undefined }
}

/** Push the current branch, setting its upstream on the first push. */
export async function push(repo: string, env: NodeJS.ProcessEnv): Promise<GitOpResult> {
  const info = await gitInfo(repo, env)
  if (!info.branch) return { ok: false, error: 'Not on a branch.' }
  if (!info.remoteUrl) return { ok: false, error: 'No "origin" remote — add one first.' }
  const args = info.upstream ? ['push'] : ['push', '-u', 'origin', info.branch]
  const r = await git(repo, args, env, { timeout: 120_000 })
  if (!r.ok) return { ok: false, error: r.err }
  return { ok: true }
}

/** `gh pr create` for the current branch; resolves the PR URL. */
export async function createPr(
  repo: string,
  opts: { title: string; body: string; draft: boolean; base?: string },
  env: NodeJS.ProcessEnv
): Promise<GitOpResult> {
  const title = opts.title.trim()
  if (!title) return { ok: false, error: 'Give the pull request a title.' }
  const args = ['pr', 'create', '--title', title, '--body-file', '-']
  if (opts.draft) args.push('--draft')
  if (opts.base) args.push('--base', opts.base)
  const r = await run('gh', args, { cwd: repo, env, timeout: 60_000, input: opts.body })
  if (!r.ok) return { ok: false, error: r.err }
  const url = (r.out.match(/https?:\/\/\S+/) ?? [])[0]
  return { ok: true, value: url ?? r.out.trim() }
}

/** The PR for the current branch (or `branch`), if one exists on GitHub. */
export async function prStatus(repo: string, env: NodeJS.ProcessEnv, branch?: string): Promise<PrInfo | null> {
  const args = ['pr', 'view']
  if (branch) args.push(branch)
  args.push('--json', 'number,url,title,state,isDraft,baseRefName,headRefName')
  const r = await run('gh', args, { cwd: repo, env, timeout: 20_000 })
  if (!r.ok) return null
  try {
    const j = JSON.parse(r.out) as PrInfo
    if (typeof j.number !== 'number') return null
    return j
  } catch {
    return null
  }
}

/** Recent commit subjects — the message generator mirrors the repo's conventions. */
export async function recentSubjects(repo: string, env: NodeJS.ProcessEnv, n = 15): Promise<string[]> {
  const r = await git(repo, ['log', `-${n}`, '--format=%s'], env)
  return r.ok ? r.out.split('\n').filter(Boolean) : []
}
