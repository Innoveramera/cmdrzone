// Project discovery for ~/Development/. Handles the three real folder shapes:
//   - plain project: root has a marker (.git / package.json / pubspec.yaml)
//   - group: no root marker, but >=1 immediate child has one (monorepo-ish folders)
//   - docs folder: only CLAUDE.md/TASKS.md (e.g. a portfolio dashboard)

import fs from 'node:fs'
import path from 'node:path'
import type { ProjectNode, ProjectType, ProjectKind } from '@shared/types'
import { colorForName } from './colors'

const IGNORE = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.dart_tool', 'Pods',
  '.gradle', '.turbo', 'out', 'coverage', '.vercel', '.idea', '.vscode', 'vendor'
])

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}
function has(dir: string, name: string): boolean {
  return fs.existsSync(path.join(dir, name))
}

interface Markers {
  git: boolean
  pkg: boolean
  pubspec: boolean
  claudeMd: boolean
  agentsMd: boolean
  tasksMd: boolean
  readme: boolean
  env: boolean
}

function readMarkers(dir: string): Markers {
  let env = false
  try {
    env = fs.readdirSync(dir).some((f) => f === '.env' || f.startsWith('.env.'))
  } catch {
    /* unreadable */
  }
  return {
    git: has(dir, '.git'),
    pkg: has(dir, 'package.json'),
    pubspec: has(dir, 'pubspec.yaml'),
    claudeMd: has(dir, 'CLAUDE.md'),
    agentsMd: has(dir, 'AGENTS.md'),
    tasksMd: has(dir, 'TASKS.md'),
    readme: has(dir, 'README.md') || has(dir, 'readme.md'),
    env
  }
}

function readScripts(dir: string): Record<string, string> | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : undefined
  } catch {
    return undefined
  }
}

function detectType(dir: string, m: Markers): ProjectType {
  if (m.pubspec) return 'flutter'
  if (m.pkg) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      if (deps.next) return 'next'
      if (pkg.bin || /mcp/i.test(pkg.name ?? '') || deps['@modelcontextprotocol/sdk']) return 'mcp'
      return 'node-ts'
    } catch {
      return 'node-ts'
    }
  }
  return 'unknown'
}

function makeNode(dir: string, name: string, kind: ProjectKind, m: Markers): ProjectNode {
  return {
    id: dir,
    name,
    path: dir,
    type: detectType(dir, m),
    kind,
    color: colorForName(name),
    isPinned: false,
    isHidden: false,
    hasClaudeMd: m.claudeMd || m.agentsMd,
    hasTasksMd: m.tasksMd,
    hasReadme: m.readme,
    hasEnv: m.env,
    hasPackageJson: m.pkg,
    scripts: m.pkg ? readScripts(dir) : undefined
  }
}

function scanChildren(dir: string): ProjectNode[] {
  const children: ProjectNode[] = []
  let entries: string[] = []
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return children
  }
  for (const name of entries) {
    if (name.startsWith('.') || IGNORE.has(name)) continue
    const child = path.join(dir, name)
    if (!isDir(child)) continue
    const m = readMarkers(child)
    if (m.git || m.pkg || m.pubspec) {
      const node = makeNode(child, name, 'project', m)
      node.parentPath = dir
      children.push(node)
    }
  }
  return children
}

function classify(dir: string, name: string): ProjectNode | null {
  const m = readMarkers(dir)
  const hasOwn = m.git || m.pkg || m.pubspec
  if (hasOwn) return makeNode(dir, name, 'project', m)

  const children = scanChildren(dir)
  if (children.length > 0) {
    const group = makeNode(dir, name, 'group', m)
    group.children = children
    return group
  }

  if (m.claudeMd || m.agentsMd || m.tasksMd) return makeNode(dir, name, 'docs', m)
  return null
}

export function scanProjects(roots: string[]): ProjectNode[] {
  const result: ProjectNode[] = []
  for (const root of roots) {
    if (!isDir(root)) continue
    let entries: string[] = []
    try {
      entries = fs.readdirSync(root)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name.startsWith('.') || IGNORE.has(name)) continue
      const dir = path.join(root, name)
      if (!isDir(dir)) continue
      const node = classify(dir, name)
      if (node) result.push(node)
    }
  }
  result.sort((a, b) => a.name.localeCompare(b.name))
  return result
}
