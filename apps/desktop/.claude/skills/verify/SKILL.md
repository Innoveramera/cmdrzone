---
name: verify
description: Verify a renderer/main change in the running CmdrZone app — launch dev mode with a CDP port, then screenshot and drive the UI over the DevTools protocol.
---

# Verifying CmdrZone changes in the running app

The renderer is sandboxed Electron — there's no browser to point tools at. The handle is
Chromium's remote-debugging port on the dev app, driven over raw CDP (HTTP + WebSocket).

## Launch (background)

```bash
cd apps/desktop && node ../../scripts/patch-electron-name.mjs && \
  ../../node_modules/.bin/electron-vite dev -- --remote-debugging-port=9223
```

- Dev mode isolates userData ("CmdrZone Dev") — never verify against the installed app's data.
- CDP is up within ~2s: `curl -s http://localhost:9223/json` lists the page target.
- Vite HMR is live: editing renderer files re-renders in place, so fix → re-probe without relaunching.
- Kill when done: `pkill -f "electron-vite dev"`.

## Drive + capture

Node ≥22 has a global `WebSocket` — a ~40-line script covers everything:
connect to `webSocketDebuggerUrl` of the `type: "page"` target, then send

- `Page.captureScreenshot {format:'png'}` → base64 → PNG (no macOS screen-recording permission needed)
- `Runtime.evaluate {expression, returnByValue:true, awaitPromise:true}` → inspect DOM, click buttons
  (`el.click()` triggers React onClick), read `window.api.*` (the preload bridge is reachable).

Hover states: dispatch `new MouseEvent('mouseover', {bubbles:true})` — React synthesizes
`onMouseEnter` from it. Note synthetic events never fire the matching `mouseleave`, so
stale-hover artifacts in probes may be unreachable for a real pointer — check before filing.

## Gotchas

- `esbuild` / `electron-vite` binaries live in the **repo root** `node_modules/.bin/`, not apps/desktop.
- Core modules (`src/core/**`, no Electron imports) can be verified standalone:
  `node_modules/.bin/esbuild apps/desktop/src/core/<mod>.ts --bundle --platform=node --format=cjs --alias:@shared=./apps/desktop/src/shared --outfile=/tmp/x.cjs` then `require` it.
- Main-process logs stream to the background task's output file — grep it for errors after driving.
