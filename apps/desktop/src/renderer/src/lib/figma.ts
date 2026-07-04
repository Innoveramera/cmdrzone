// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Pure helpers for turning a pasted Figma URL into an embeddable embed.figma.com URL.
// No electron/node imports — safe to use in the renderer.

const EMBED_HOST = 'cmdrzone'

// Map the path segment of a figma.com URL to the embed.figma.com path segment.
// design/file -> design, proto -> proto (prototypes), board -> board (FigJam).
const KIND: Record<string, 'design' | 'proto' | 'board'> = {
  design: 'design',
  file: 'design',
  proto: 'proto',
  board: 'board'
}

export interface ParsedFigma {
  embedUrl: string
  fileKey: string
  kind: 'design' | 'proto' | 'board'
}

/**
 * Turn a pasted Figma URL into an embeddable embed.figma.com URL.
 * Accepts www.figma.com / figma.com / embed.figma.com inputs and carries a
 * deep-link `node-id` through if present. Returns null if it isn't a
 * recognizable Figma file URL.
 */
export function toFigmaEmbedUrl(raw: string): ParsedFigma | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (!/(^|\.)figma\.com$/.test(u.hostname)) return null

  // /<kind>/<fileKey>/<slug?>
  const m = /^\/(design|file|proto|board)\/([A-Za-z0-9]+)/.exec(u.pathname)
  if (!m) return null
  const kind = KIND[m[1]!]!
  const fileKey = m[2]!

  const slug = u.pathname.split('/')[3] || EMBED_HOST
  const embed = new URL(`https://embed.figma.com/${kind}/${fileKey}/${slug}`)
  // Carry the deep-link node selection through if present.
  const nodeId = u.searchParams.get('node-id')
  if (nodeId) embed.searchParams.set('node-id', nodeId)
  embed.searchParams.set('embed-host', EMBED_HOST)
  return { embedUrl: embed.toString(), fileKey, kind }
}

/**
 * Human-readable reason why `raw` can't be embedded. Call only when
 * toFigmaEmbedUrl(raw) returned null. Distinguishes the common case of a Figma
 * *project* (folder) link — which has no embed — from a non-Figma URL.
 */
export function figmaUrlHint(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'Klistra in en Figma-länk.'
  let u: URL | null = null
  try {
    u = new URL(trimmed)
  } catch {
    u = null
  }
  if (!u || !/(^|\.)figma\.com$/.test(u.hostname)) {
    return 'Det där ser inte ut som en Figma-länk. Klistra in en figma.com-URL.'
  }
  // A figma.com URL, but a project/file-browser path — not an embeddable file.
  if (/^\/files\//.test(u.pathname) || /\/project\//.test(u.pathname)) {
    return 'Det här är en länk till ett Figma-projekt (en mapp med filer), inte en enskild fil. Öppna en fil i projektet och använd Dela → Kopiera länk — den ser ut som figma.com/design/…'
  }
  return 'Kunde inte tolka länken. Använd Dela → Kopiera länk på en enskild Figma-fil (design, prototyp eller FigJam).'
}
