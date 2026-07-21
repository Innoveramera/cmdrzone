// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Create a brand-new project folder under the scan root: <root>/<name> + git init +
// a CLAUDE.md seeded with the user's idea ("what do you want to build"). The CLAUDE.md
// doubles as a scan marker, so the project stays visible even if git init fails.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { CreateProjectResult } from '@shared/types'
import { sanitizeProjectName } from '@shared/project-name'

function seedClaudeMd(name: string, description: string): string {
  const idea = description.trim()
  const vision = idea ? `\n${idea}\n` : '\n_(describe the project here)_\n'
  return `# ${name}\n${vision}\n<!-- Keep this file current as the project takes shape: commands, architecture, gotchas. -->\n`
}

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
    fs.writeFileSync(path.join(target, 'CLAUDE.md'), seedClaudeMd(name, description), 'utf8')
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  // Best-effort: a repo from day one (also what makes the scanner classify it as a project).
  try {
    execFileSync('git', ['init', target], { env, encoding: 'utf8', timeout: 15000, stdio: 'ignore' })
  } catch {
    /* no git on PATH — the CLAUDE.md marker keeps the folder discoverable */
  }

  return { ok: true, path: target }
}
