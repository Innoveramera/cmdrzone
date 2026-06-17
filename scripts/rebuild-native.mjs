// Rebuild native modules (better-sqlite3, node-pty) against Electron's ABI.
//
// We invoke node-gyp directly (not @electron/rebuild) for two reasons:
//   1. @electron/rebuild's CLI crashes under Node 26 (a yargs ESM/CJS bug).
//   2. Its programmatic dependency-walker finds nothing under pnpm's hoisted layout
//      when pointed at the workspace root (root package.json has no prod deps).
// Direct node-gyp against the hoisted node_modules is deterministic.

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronVersion = require(path.join(root, 'node_modules/electron/package.json')).version
const arch = process.arch
const distUrl = 'https://electronjs.org/headers'
const nodeGyp = path.join(root, 'node_modules', '.bin', 'node-gyp')

const env = {
  ...process.env,
  npm_config_runtime: 'electron',
  npm_config_target: electronVersion,
  npm_config_arch: arch,
  npm_config_target_arch: arch,
  npm_config_disturl: distUrl,
  npm_config_build_from_source: 'true'
}

const modules = ['better-sqlite3', 'node-pty']
console.log(`Rebuilding [${modules.join(', ')}] for Electron ${electronVersion} (${arch})…`)

for (const mod of modules) {
  const cwd = path.join(root, 'node_modules', mod)
  if (!fs.existsSync(path.join(cwd, 'binding.gyp'))) {
    console.warn(`skip ${mod} (no binding.gyp at ${cwd})`)
    continue
  }
  console.log(`\n--- rebuilding ${mod} ---`)
  execFileSync(
    nodeGyp,
    ['rebuild', `--target=${electronVersion}`, `--arch=${arch}`, `--dist-url=${distUrl}`],
    { cwd, stdio: 'inherit', env }
  )
}

console.log('\nNative rebuild complete.')
