# Contributing to CmdrZone

Thanks for your interest! This is an Electron + TypeScript desktop app in a pnpm workspace.

## Dev setup

Requirements: macOS, Node ≥ 20, pnpm ≥ 10, Xcode Command Line Tools.

```bash
pnpm install
pnpm rebuild:native   # rebuild node-pty + better-sqlite3 for Electron — run after every install
pnpm dev
```

Scripts:

| Command | What it does |
|---|---|
| `pnpm dev` | run the app with hot reload |
| `pnpm build` | build main / preload / renderer |
| `pnpm typecheck` | TypeScript checks (node + web projects) |
| `pnpm rebuild:native` | recompile native modules for Electron's ABI |
| `pnpm dist` | package a DMG |

## Native modules (read this first)

pnpm 10 blocks dependency build scripts by default, and native modules build for *system* Node,
not Electron. The repo handles both:

- `pnpm.onlyBuiltDependencies` in the root `package.json` allows electron / esbuild /
  better-sqlite3 / node-pty to run their build scripts.
- `pnpm rebuild:native` (→ `scripts/rebuild-native.mjs`) recompiles node-pty + better-sqlite3
  against Electron's ABI via node-gyp.

If you see a `NODE_MODULE_VERSION` mismatch at launch, run `pnpm rebuild:native`.

## Architecture

Keep `core` / `pty` / `shared` free of Electron imports. All privileged work crosses the typed IPC
contract in `apps/desktop/src/shared/ipc.ts`. See the README for the folder map.

## Headless smoke checks

These run the main process without needing to click the UI:

```bash
SB_SMOKE=1 node_modules/.bin/electron apps/desktop   # native modules load + login-shell PTY runs `claude --version`
SB_SCAN=1  node_modules/.bin/electron apps/desktop   # prints the project-scan result
```

## Style

- TypeScript strict; match the conventions of the files around your change.
- Keep PRs focused. Run `pnpm typecheck && pnpm build` before opening one.

## Pull requests

1. Fork and branch from `main`.
2. Describe the problem your change solves.
3. Ensure `pnpm typecheck && pnpm build` pass.
4. Open the PR.

By contributing, you agree that your contributions are licensed under **GPL-3.0-or-later**.
