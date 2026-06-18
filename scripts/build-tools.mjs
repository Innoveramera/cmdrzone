// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Bundle the CLI and MCP server (src/cli, src/mcp) into self-contained CJS files under
// apps/desktop/out/. They reuse @core/@shared source and are run via ELECTRON_RUN_AS_NODE
// (see bin/), so better-sqlite3 stays external and loads from node_modules at the Electron ABI.

import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktop = path.join(root, 'apps/desktop')

const alias = {
  '@core': path.join(desktop, 'src/core'),
  '@shared': path.join(desktop, 'src/shared'),
  '@pty': path.join(desktop, 'src/pty')
}

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // Native module: keep external so it loads from node_modules (rebuilt for Electron's ABI).
  external: ['better-sqlite3'],
  alias,
  logLevel: 'info'
}

const entries = [
  { in: 'src/cli/index.ts', out: 'out/cli.cjs' },
  { in: 'src/mcp/index.ts', out: 'out/mcp.cjs' }
]

for (const e of entries) {
  await build({
    ...common,
    entryPoints: [path.join(desktop, e.in)],
    outfile: path.join(desktop, e.out)
  })
  console.log(`bundled ${e.in} -> apps/desktop/${e.out}`)
}
