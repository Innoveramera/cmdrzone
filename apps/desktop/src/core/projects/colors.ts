// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Deterministic, stable per-project accent colors. The same project always gets the
// same color (used across cards, rail, tabs, banner) so the brain learns it.

const PALETTE = [
  '#e06c75', '#e5c07b', '#98c379', '#56b6c2', '#61afef', '#c678dd',
  '#d19a66', '#57d9a3', '#ff79c6', '#bd93f9', '#8be9fd', '#ffb86c',
  '#7aa2f7', '#9ece6a', '#f7768e', '#bb9af7'
]

export function colorForName(name: string): string {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = (h * 33) ^ name.charCodeAt(i)
  return PALETTE[Math.abs(h) % PALETTE.length]!
}
