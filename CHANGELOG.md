# Changelog

All notable changes to CmdrZone are documented here. This project adheres to
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The app reads this file at runtime: each `## [version]` section becomes an entry in the
in-app **What's New** dialog, and the section matching the running build is shown automatically
the first time that version launches.

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
