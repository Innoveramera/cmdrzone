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
- **Durable sessions (tmux):** when `tmux` is on PATH, each terminal's PTY is a tmux *client*
  attached to a session (`tmux -L cmdrzone -f <userData>/tmux.conf new-session -A -s cz_<id>`) on a
  detached server, so agents survive reload/quit and **reattach** on next launch. `core/tmux/tmux.ts`
  owns the tmux logic; `session-manager.ts` falls back to the classic direct `pty.spawn` when tmux is
  absent. Key invariant: **dispose = detach** (kills only the client → session lives), **kill =
  destroy** (`pty:kill` → `tmux kill-session`, used only when the user closes a tab). The renderer
  persists its tab/pane layout (`settings.workspace`) and on boot prunes it against
  `durable.list()` (live sessions) before reattaching. Don't make dispose kill the session, and
  don't re-run `initialCommand`/`spawn` on reattach (guarded by `has-session`).
- **In-app updater is hybrid (`main/updater.ts`).** It only wires `electron-updater` when
  `app.isPackaged`, so dev never tries to self-update. macOS can't install in place unless the app
  is Developer-ID-signed + notarized, so `AUTO_INSTALL` defaults off: it checks/notifies and routes
  to the release page. Don't set `AUTO_INSTALL`/`CMDRZONE_AUTO_INSTALL=1` until signing exists, and
  keep `mac.target` including `zip` + the `publish` block in `electron-builder.yml` (the updater
  reads `latest-mac.yml`). `CHANGELOG.md` is shipped via `extraResources` and shown as **What's New**.

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

## Managing this project's board (you can file/move tickets yourself)

CmdrZone ships a CLI that writes board cards straight to `cmdrzone.db`. When working in this repo you
should use it to track work — file a card for a new idea/bug/follow-up, move cards across columns as
you go. The CLI runs under `ELECTRON_RUN_AS_NODE` (no app needs to be running).

**Default to the installed *CmdrZone* app's board (no flag)** so tickets land in the user's daily
command center. Add `--dev` to target the `pnpm dev` ("CmdrZone Dev") store instead. This project is
`--project secondbrain`. Columns: **Ideas / To Do / In Progress / Done**; types: `idea|feature|bug|task`.

```bash
# Prereq: the bundle must exist — run `pnpm build` once if apps/desktop/out/cli.cjs is missing.
node bin/cmdrzone.mjs board show --project secondbrain
node bin/cmdrzone.mjs card add  --project secondbrain --column Ideas --title "…" --type feature --body "…"
node bin/cmdrzone.mjs card move --id <cardId> --column "In Progress"
node bin/cmdrzone.mjs card update --id <cardId> --title "…" --type bug
node bin/cmdrzone.mjs --help     # full surface: card add|update|move|rm, column add|rename|rm, --json
```

`card add --json` returns the new card's `id` (use it for `move`/`update`/`rm`). An open board in the
app refreshes when its window regains focus. Code lives in `core/board/commands.ts` (shared by the
CLI and the MCP server in `src/mcp/`); see the README's "Agent CLI / MCP" section.
