// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import type { BoardCard } from '@shared/types'

// Compose a type-aware initial prompt from a board card. Shown editable in the launch preview.
export function composePrompt(card: BoardCard): string {
  const title = card.title.trim()
  const body = card.body.trim()
  const tail = body ? `\n\n${body}` : ''
  const imgs = card.attachments ?? []
  // List attached image paths so the agent can read them (Claude Code opens local image paths).
  const images = imgs.length
    ? `\n\nAttached image${imgs.length > 1 ? 's' : ''} (read ${imgs.length > 1 ? 'them' : 'it'}):\n${imgs
        .map((a) => a.path)
        .join('\n')}`
    : ''
  const head = ((): string => {
    switch (card.type) {
      case 'bug':
        return `Fix this bug in this project.\n\n## ${title}${tail}`
      case 'feature':
        return `Implement this feature in this project.\n\n## ${title}${tail}`
      case 'task':
        return `Do this task in this project.\n\n## ${title}${tail}`
      case 'idea':
      default:
        return `${title}${tail}`
    }
  })()
  return head + images
}

// First prompt for a freshly created project: the user's idea plus enough framing for
// Claude to bootstrap sensibly (the same idea is also persisted in the new CLAUDE.md).
export function composeNewProjectPrompt(name: string, description: string): string {
  return [
    `This is a brand-new, empty project called "${name}" — a fresh folder with git initialized and a CLAUDE.md holding the idea below. Here's what I want to build:`,
    description.trim(),
    'Help me get it off the ground: propose a fitting tech stack and project structure (ask me first if anything important is unclear), scaffold the initial skeleton with dev/build tooling and a README, and update CLAUDE.md with the commands and architecture. Then suggest the first iteration.'
  ].join('\n\n')
}
