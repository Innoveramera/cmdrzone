# CLAUDE.md — working in this repo

CmdrZone is a macOS-first Electron + TypeScript desktop app (a command center for many
projects + AI coding agents). pnpm workspace. See `README.md` and `CONTRIBUTING.md` for the
full picture.

## License header — REQUIRED on every new source file

This project is **GPL-3.0-or-later**. Every new source file (`.ts`, `.tsx`, `.mjs`, `.js`) must
begin with this exact header:

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström
```

For `.css` use block comments:

```css
/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright (C) 2026 Fredrik Hammarström */
```

Do **not** add headers to `.json` (no comment syntax) or `.md` files. When creating any new
source file, add the header first, before imports. (Triple-slash `/// <reference>` directives must
still come after the header comment lines — that's allowed.)

## Commands

```bash
pnpm dev              # run with hot reload
pnpm build            # build main / preload / renderer
pnpm typecheck        # tsc on node + web projects — run before finishing
pnpm rebuild:native   # recompile node-pty + better-sqlite3 for Electron's ABI
pnpm dist             # package a DMG
```

Run `pnpm typecheck && pnpm build` before considering a change done.

## Gotchas (already solved — don't regress)

- **Run `pnpm rebuild:native` after every `pnpm install`.** Native modules build for system Node;
  Electron needs them rebuilt for its ABI (else `NODE_MODULE_VERSION` mismatch). Wired in
  `scripts/rebuild-native.mjs` (node-gyp directly; `@electron/rebuild`'s CLI is broken on Node 26).
- **Never set xterm `macOptionIsMeta`** — it breaks typing `@ $ { } [ ]` on Nordic/German keyboards.
- **PATH:** terminals must spawn a login+interactive shell (`zsh -l -i`); env is composed in
  `core/env/shell-path.ts` so `claude`/node/pnpm resolve. Don't bypass it.
- Native modules (`node-pty`, `better-sqlite3`) load only in the main/PTY-host processes.

## Architecture (keep the boundaries)

```
apps/desktop/src/
  shared/    # types + typed IPC contract (NO electron/node imports)
  core/      # domain logic: env, project scanner, agents, persistence, fs (no electron)
  pty/       # node-pty session manager (runs in the PTY-host utilityProcess)
  main/      # electron main + pty-host entry
  preload/   # contextBridge surface (the ONLY renderer→main bridge)
  renderer/  # React UI: Zustand store, xterm terminals, CodeMirror editor
```

- All privileged work crosses the typed IPC in `shared/ipc.ts` → `preload/index.ts` → `main`.
- Renderer is locked down (`sandbox: true`, `contextIsolation: true`, no `nodeIntegration`).
- Keep `core`/`pty`/`shared` free of Electron imports so they stay portable.

## Headless checks (no GUI needed)

```bash
SB_SMOKE=1 node_modules/.bin/electron apps/desktop   # native modules + PTY runs `claude --version`
SB_SCAN=1  node_modules/.bin/electron apps/desktop   # prints the project scan
```
