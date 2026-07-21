// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Folder-name sanitizer for new projects, shared by main (actual create) and the
// renderer (live path preview in the dialog) so both always agree on the result.
// Keeps case (folders like "MyApp" are fine), allows letters/digits/._-, and strips
// leading dots/dashes so the scanner never skips the new folder as hidden.

export function sanitizeProjectName(raw: string): string {
  return raw
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64)
}
