// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Theme registry. The CSS palette lives in styles.css (default, dark) and
// themes/totalcommander.css (overrides under html[data-theme="totalcommander"]).
// This module owns the bits CSS can't reach: the xterm + Monaco theming, the
// catalog the Settings picker renders, and applying the data-theme attribute.

export type ThemeId = 'dark' | 'totalcommander'

/** Minimal xterm theme — xterm merges this over its defaults, so a few keys suffice. */
interface XtermTheme {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
}

export interface ThemeDef {
  id: ThemeId
  label: string
  description: string
  /** xterm.js terminal palette */
  xterm: XtermTheme
  /** Monaco built-in theme id ('vs' = light, 'vs-dark' = dark) */
  monaco: string
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  dark: {
    id: 'dark',
    label: 'CmdrZone Dark',
    description: 'The default — deep navy panels, One-Dark accents, rounded chrome.',
    xterm: {
      background: '#0b0d12',
      foreground: '#d7dce5',
      cursor: '#9bb4ff',
      selectionBackground: '#2b3650'
    },
    monaco: 'vs-dark'
  },
  totalcommander: {
    id: 'totalcommander',
    label: 'Total Commander',
    description: 'Classic Windows file-manager look — silver bevels, square corners, a function-key bar, and a black console.',
    xterm: {
      // Classic DOS/console: black field, light-gray text, phosphor-green cursor.
      background: '#000000',
      foreground: '#c0c0c0',
      cursor: '#00ff00',
      selectionBackground: '#000080'
    },
    monaco: 'vs'
  }
}

export const THEME_LIST: ThemeDef[] = [THEMES.dark, THEMES.totalcommander]

export function isThemeId(v: string): v is ThemeId {
  return v === 'dark' || v === 'totalcommander'
}

/** Reflect the active theme onto <html data-theme="…"> so the CSS overrides take effect. */
export function applyThemeToDom(id: ThemeId): void {
  document.documentElement.dataset.theme = id
}
