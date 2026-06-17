// Minimal filesystem reads for the file explorer + doc previews. Read-only.
import fs from 'node:fs'
import path from 'node:path'
import type { DirEntry } from '@shared/types'

const HEAVY = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.dart_tool', '.gradle',
  'Pods', '.turbo', '.vercel', 'coverage', 'out'
])

export function readDir(dir: string): DirEntry[] {
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: DirEntry[] = []
  for (const e of entries) {
    if (e.name === '.DS_Store') continue
    const isDir = e.isDirectory()
    out.push({
      name: e.name,
      path: path.join(dir, e.name),
      isDir,
      heavy: isDir && HEAVY.has(e.name)
    })
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
  return out
}

export function writeTextFile(file: string, content: string): boolean {
  try {
    fs.writeFileSync(file, content, 'utf8')
    return true
  } catch {
    return false
  }
}

export function readTextFile(file: string, maxBytes = 256 * 1024): string {
  try {
    const stat = fs.statSync(file)
    if (stat.size > maxBytes) {
      return fs.readFileSync(file).subarray(0, maxBytes).toString('utf8') + '\n…(truncated)'
    }
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}
