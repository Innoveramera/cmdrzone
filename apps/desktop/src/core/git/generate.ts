// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Draft a commit message + PR title/body from a diff with a headless `claude -p` run — the
// same Claude Code the user already has installed and signed in to, no API key needed.
// Repository conventions come from the project's instructions file and its recent commit
// subjects (mirrors T3 Code's "Repository conventions" style). The reply uses fixed markers
// so parsing needs no JSON discipline from the model. No electron imports.

import fs from 'node:fs'
import path from 'node:path'
import type { GeneratedMessages } from '@shared/git'
import { run } from './run'
import { patchText } from './changes'
import { recentSubjects } from './flow'

const MAX_PATCH = 60_000
const MAX_INSTRUCTIONS = 4_000

function readInstructions(repo: string): string {
  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    try {
      const s = fs.readFileSync(path.join(repo, f), 'utf8')
      if (s.trim() && !/^@AGENTS\.md\s*$/m.test(s.trim().split('\n')[0] ?? '')) return s.slice(0, MAX_INSTRUCTIONS)
    } catch {
      /* next */
    }
  }
  return ''
}

function buildPrompt(opts: {
  patch: string
  subjects: string[]
  instructions: string
  branch?: string
  defaultBranch?: string
}): string {
  const conventions = opts.subjects.length
    ? `Recent commit subjects in this repository (match their style, tense and length):\n${opts.subjects.map((s) => `- ${s}`).join('\n')}`
    : 'The repository has no commits yet.'
  const instr = opts.instructions
    ? `Project instructions (for context on conventions and vocabulary):\n"""\n${opts.instructions}\n"""`
    : ''
  return [
    'You write commit messages and pull-request descriptions for a developer. Read the diff below and draft both.',
    conventions,
    instr,
    opts.branch ? `Branch: ${opts.branch}${opts.defaultBranch ? ` (targets ${opts.defaultBranch})` : ''}` : '',
    'Rules:',
    '- Commit subject: imperative mood, ≤ 72 characters, no trailing period, no emoji unless the recent subjects use them.',
    '- Commit body: 0–6 short lines explaining what and why (not how); omit if the subject says it all.',
    '- PR title: may equal the subject. PR body: Markdown with a 1–3 sentence summary, then a "## Changes" bullet list, then "## Notes" only if there is something a reviewer must know. No test plan section unless tests changed.',
    '- Never mention that an AI wrote this. Do not invent changes that are not in the diff.',
    'Reply with EXACTLY this layout and nothing else:',
    '<<<SUBJECT>>>',
    '(commit subject)',
    '<<<BODY>>>',
    '(commit body, may be empty)',
    '<<<PR_TITLE>>>',
    '(pull request title)',
    '<<<PR_BODY>>>',
    '(pull request body in Markdown)',
    '<<<END>>>',
    'Diff:',
    '```diff',
    opts.patch,
    '```'
  ]
    .filter(Boolean)
    .join('\n\n')
}

function section(text: string, name: string, next: string): string {
  const a = text.indexOf(`<<<${name}>>>`)
  if (a === -1) return ''
  const start = a + name.length + 6
  const b = text.indexOf(`<<<${next}>>>`, start)
  return (b === -1 ? text.slice(start) : text.slice(start, b)).trim()
}

/**
 * Run `claude -p` over the diff between `base` and `tree`. `claudeBin` is the resolved
 * binary (from composeEnv) so we don't depend on PATH inside the app process.
 */
export async function generateMessages(
  repo: string,
  base: string,
  tree: string,
  opts: { claudeBin: string | null; model?: string; branch?: string; defaultBranch?: string },
  env: NodeJS.ProcessEnv
): Promise<GeneratedMessages> {
  if (!opts.claudeBin) return { ok: false, error: 'Claude Code is not installed — write the message by hand.' }
  const patch = await patchText(repo, base, tree, env, MAX_PATCH)
  if (!patch.trim()) return { ok: false, error: 'No changes to describe.' }
  const subjects = await recentSubjects(repo, env)
  const prompt = buildPrompt({ patch, subjects, instructions: readInstructions(repo), branch: opts.branch, defaultBranch: opts.defaultBranch })
  // A nested Claude Code refuses to start when it sees its parent's CLAUDECODE marker; we are
  // a GUI app, not a session, so strip it. `--tools ""` keeps it from wandering off to read
  // files — one pure text turn. (Not `--bare`: that also skips the stored login.)
  const cleanEnv: NodeJS.ProcessEnv = { ...env }
  delete cleanEnv.CLAUDECODE
  delete cleanEnv.CLAUDE_CODE_ENTRYPOINT
  const args = ['-p', '--tools', '', '--output-format', 'text', '--no-session-persistence']
  if (opts.model) args.push('--model', opts.model)
  const r = await run(opts.claudeBin, args, { cwd: repo, env: cleanEnv, timeout: 120_000, input: prompt })
  if (!r.ok) return { ok: false, error: r.err || 'claude -p failed' }
  const text = r.out
  const commitSubject = section(text, 'SUBJECT', 'BODY').split('\n')[0]?.trim() ?? ''
  if (!commitSubject) return { ok: false, error: 'Could not parse the generated message.' }
  return {
    ok: true,
    commitSubject,
    commitBody: section(text, 'BODY', 'PR_TITLE'),
    prTitle: section(text, 'PR_TITLE', 'PR_BODY') || commitSubject,
    prBody: section(text, 'PR_BODY', 'END')
  }
}
