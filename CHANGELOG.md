# Changelog

All notable changes to CmdrZone are documented here. This project adheres to
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The app reads this file at runtime: each `## [version]` section becomes an entry in the
in-app **What's New** dialog, and the section matching the running build is shown automatically
the first time that version launches.

## [0.8.0] - 2026-09-02

### Added

- **The organism.** CmdrZone is alive on the dashboard: an ambient being lives behind the home
  hero, one glowing nucleus per running agent. Working agents burn bright and spin, a waiting one
  goes amber, stops and opens an eye that looks at you, errors jitter red. Claude Code's hook
  events are its reflexes — reads inhale, writes exhale, Bash sparks, subagents bud off — and with
  nothing running it folds into a single sleeping core that breathes and keeps a slow heartbeat.
  Theme-aware (grayscale in Mono and Zone), off in Total Commander, still under reduced motion.
- **The voice.** The line under the greeting now says what's actually going on — "Reading through
  cmdrzone.", "Waiting for you — alerto needs an answer.", "Finished in api. Take a look when you
  have a moment." — with quieter murmurs in between: how old the organism is, tokens digested
  today, repos with uncommitted changes.
- **⌃Tab / ⌃⇧Tab cycles through active projects** — the sidebar's Active list, top to bottom,
  wrapping; ⌃⇧Tab goes back. ⌘⌥→ / ⌘⌥← now follow the same order.

## [0.7.0] - 2026-08-26

### Added

- **New theme: Zone.** Mono's sibling, named for Ansel Adams' Zone System — layered charcoal
  surfaces instead of true black, and grayscale all the way down: the terminal's 16 ANSI colors
  and the code editor's syntax highlighting are remapped onto a gray ramp, so brightness carries
  what hue used to. Nothing renders in color. Pick it in ⚙ Settings → Theme.

## [0.6.0] - 2026-08-26

### Added

- **New theme: Mono.** A clean, minimal grayscale skin — true-black panels, light typography,
  hairline borders, and no color anywhere: status and accents are carried by brightness alone.
  Color emoji and per-project dots flatten to monochrome, while the terminal and code editor
  keep their colors so content stays readable. Pick it in ⚙ Settings → Theme.

## [0.5.0] - 2026-08-18

### Added

- **AGENTS.md is now the canonical instructions file for new projects.** The New Project
  dialog seeds your idea into `AGENTS.md` — the cross-agent standard read directly by
  Codex CLI, Gemini CLI and opencode — plus a one-line `CLAUDE.md` pointer (`@AGENTS.md`)
  so Claude Code picks up the same instructions. One source of truth, every agent reads it.

### Changed

- Project cards and the Project panel now show the instructions file that actually exists:
  the badge says AGENTS.md or CLAUDE.md accordingly, and the docs preview gets an AGENTS.md
  tab. This also fixes AGENTS.md-only projects, which used to show a "CLAUDE.md" badge and
  an empty preview.

## [0.4.0] - 2026-07-21

### Added

- **Home mission-control dashboard.** The start view (no project selected) now opens with a
  greeting hero — set your name once via **+ name** — showing a live clock and real telemetry:
  agents live, **waiting on you**, overdue cards, up next, dirty repos, and today's Claude
  spend. Below it, two aggregate panels: **Up next** gathers the To Do / In Progress cards
  from *every* project's board (click a card to jump straight to its board), and **Agents**
  lists live sessions attention-first. The dark theme gets a subtle holo glow and light sweep
  (disabled with reduced motion); the Total Commander skin keeps its classic face.
- **Due dates + priority on board cards.** Give any card a due date and a ★ priority star in
  the card editor. Card faces and Up next show an urgency chip — quiet when distant, amber for
  today/tomorrow, red when overdue — and the home hero warns when something is past due.
  Up next sorts deadlines first (soonest on top), then starred cards, then column order.
  Agents can set them too: `cmdrzone card add/update --due 2026-07-25|today|tomorrow`
  `--prio|--no-prio`, and the MCP `create_card`/`update_card` tools take `due`/`priority`.
- **New Project dialog (⌘N).** Describe your idea, get a ready folder under your projects
  root — git initialized, CLAUDE.md seeded with the idea — and optionally launch Claude with
  that idea as its very first prompt.

### Changed

- The Claude usage widget moved below the new Up next / Agents panels on the dashboard.

## [0.3.0] - 2026-07-05

### Added

- **Exact agent status via Claude Code hooks.** CmdrZone now wires every Claude Code session
  up to a local hook endpoint, so working / waiting / done comes from Claude's own lifecycle
  events instead of terminal-output guessing. The agent rail shows the tool being run
  (`▸ Bash`, `▸ Edit`…), notifications carry the actual permission question, and status keeps
  flowing across app restarts for durable (tmux) sessions. Other agents (Aider, Codex, …)
  keep the old heuristic as a fallback.
- **Parallel agents in git worktrees.** The **＋ ⎇ Worktree** button in the terminal deck
  creates an isolated checkout on its own `cz/<name>` branch and launches the project's agent
  there — run several agents on the same repo without file collisions. Worktrees appear as ⎇
  children in the project tree (own status pill, git state, ⌘⌥←/→ cycling), share the main
  project's board, and a banner offers **Merge & remove** (conflicts abort safely) or
  **Discard** when the work is done.
- **Design tab (F6).** Paste a Figma file / prototype / FigJam link and it renders live in the
  new 🎨 Design tab next to your agents. Sign-in works inside the embed, deep links to a
  specific frame are kept, and the connection persists per project.
- **Themes + Total Commander skin.** A theme system with a retro Total Commander look,
  including a function-key bar (F2 Dash · F3 Board · F4 Editor · F5 Terminals · F6 Design ·
  F7 Shell · F8 Close · F10 Menu).
- **Terminal quality-of-life.** Select and copy text with a plain click-drag even while an
  agent TUI has mouse reporting on (copy-on-select included), and **Shift+Enter** inserts a
  newline at agent prompts instead of submitting.
- **⌘⌥←/→** cycles between projects that have an open agent, attention-first (waiting →
  error → working → done).

### Changed

- **Electron 33 → 39** (Chromium security fixes) and matching electron-builder updates.

### Fixed

- Pinned projects no longer highlight twice in the sidebar (Pinned + All projects).

## [0.2.0] - 2026-06-19

### Added

- **Image attachments on board cards.** Attach images to a card from the editor — pick a
  file, drag-and-drop, or paste a screenshot (⌘V). Thumbnails show in the editor with a quick
  remove, and the card face gets a cover thumbnail plus a 📎 badge. Starting a Claude session
  from a card now includes the attached image paths so the agent can read them.
- **Drop images into a session.** Drag an image onto any terminal pane and its file path is
  inserted at the prompt (no Enter) — add your own context and submit. Claude Code reads the
  image straight from the path.

### Removed

- The bottom **“Message…”** bar under terminals. Type in the terminal directly (and drop
  images onto it).

## [0.1.0] - 2026-06-18

### Added

- **In-app updates.** CmdrZone now checks GitHub Releases for newer versions in the background.
  When the app is code-signed it downloads the update and offers **Restart to update**; otherwise
  it shows a notice that opens the release page so you can grab the new build manually.
- **What's New dialog.** Opens automatically the first time a new version runs, and any time from
  the version label in the sidebar footer. Reads its release notes from this changelog.
- **Version label** in the sidebar footer, with a manual *Check for updates* action.

### Notes

- macOS only installs updates in place for apps signed with an Apple Developer ID and notarized.
  Until signing is configured, the updater runs in notify-and-open-release-page mode.
