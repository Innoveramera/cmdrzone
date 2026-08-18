// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Create a brand-new project folder under the scan root: <root>/<name> + git init +
// an AGENTS.md seeded with the user's idea ("what do you want to build"). AGENTS.md is
// the cross-agent standard (Codex/Gemini/opencode read it directly); Claude Code only
// reads CLAUDE.md, so a pointer CLAUDE.md imports it via `@AGENTS.md`. The seeded files
// double as scan markers, so the project stays visible even if git init fails.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { CreateProjectResult } from '@shared/types'
import { sanitizeProjectName } from '@shared/project-name'

function seedAgentsMd(name: string, description: string): string {
  const idea = description.trim()
  const vision = idea ? `\n${idea}\n` : '\n_(describe the project here)_\n'
  return `# ${name}\n${vision}\n<!-- Keep this file current as the project takes shape: commands, architecture, gotchas. -->\n`
}

const CLAUDE_MD_POINTER =
  '@AGENTS.md\n\n<!-- Claude Code reads CLAUDE.md; the instructions live in AGENTS.md (imported above). -->\n'

export function createProject(
  root: string,
  rawName: string,
  description: string,
  env: NodeJS.ProcessEnv
): CreateProjectResult {
  const name = sanitizeProjectName(rawName)
  if (!name) return { ok: false, error: 'Give the project a name (letters/digits/dashes).' }

  const target = path.join(root, name)
  if (fs.existsSync(target)) return { ok: false, error: `"${name}" already exists in ${root}.` }

  try {
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, 'AGENTS.md'), seedAgentsMd(name, description), 'utf8')
    fs.writeFileSync(path.join(target, 'CLAUDE.md'), CLAUDE_MD_POINTER, 'utf8')
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  // Best-effort: a repo from day one (also what makes the scanner classify it as a project).
  try {
    execFileSync('git', ['init', target], { env, encoding: 'utf8', timeout: 15000, stdio: 'ignore' })
  } catch {
    /* no git on PATH — the AGENTS.md marker keeps the folder discoverable */
  }

  return { ok: true, path: target }
}
