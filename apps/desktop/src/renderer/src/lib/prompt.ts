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
