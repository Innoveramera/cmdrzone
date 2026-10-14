// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Theme registry. The CSS palette lives in styles.css (default, dark) with
// per-theme overrides in theme/monochrome.css, theme/zone.css and
// theme/totalcommander.css, theme/light.css (each scoped under html[data-theme="<id>"]).
// This module owns the bits CSS can't reach: the xterm + Monaco theming, the
// catalog the Settings picker renders, and applying the data-theme attribute.

import { type CustomTheme, CUSTOM_DOM_ID, applyCustomThemeCss, isCustomThemeId } from './custom'

export type ThemeId = 'dark' | 'mono' | 'zone' | 'totalcommander' | 'daylight' | 'paper'

/** Minimal xterm theme — xterm merges this over its defaults, so a few keys suffice.
    The ANSI slots are optional: Zone remaps all 16 onto a gray ramp; other themes
    keep xterm's stock colors. */
interface XtermTheme {
  background: string
  foreground: string
  cursor: string
  cursorAccent?: string
  selectionBackground: string
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string
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
  mono: {
    id: 'mono',
    label: 'Mono',
    description: 'Pure grayscale — true-black panels, light type, hairline borders, monochrome glyphs.',
    xterm: {
      background: '#000000',
      foreground: '#e6e6e6',
      cursor: '#ffffff',
      selectionBackground: '#2e2e2e'
    },
    monaco: 'vs-dark'
  },
  zone: {
    id: 'zone',
    label: 'Zone',
    description:
      'Grayscale all the way down — layered charcoal panels, and even terminal ANSI + code syntax remapped onto a gray ramp. Named for the Zone System.',
    xterm: {
      background: '#0f0f0f',
      foreground: '#cfcfcf',
      cursor: '#ffffff',
      cursorAccent: '#0f0f0f',
      selectionBackground: '#383838',
      // The 16 ANSI slots become zones on a gray ramp. Brightness carries the
      // meaning color used to: red (errors) is the loudest at pure white, green
      // sits just below, the rest step down in luminance.
      black: '#1c1c1c',
      red: '#ffffff',
      green: '#c9c9c9',
      yellow: '#8f8f8f',
      blue: '#a6a6a6',
      magenta: '#dadada',
      cyan: '#9b9b9b',
      white: '#e8e8e8',
      brightBlack: '#616161',
      brightRed: '#ffffff',
      brightGreen: '#d9d9d9',
      brightYellow: '#a5a5a5',
      brightBlue: '#bcbcbc',
      brightMagenta: '#ececec',
      brightCyan: '#b1b1b1',
      brightWhite: '#ffffff'
    },
    // Custom grayscale Monaco theme, registered in CodeEditor.tsx at module load.
    monaco: 'zone'
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
  },
  daylight: {
    id: 'daylight',
    label: 'Daylight',
    description: 'Light — crisp white panels on a cool gray ground, blue accent. For bright rooms.',
    // Full ANSI set: xterm's stock yellow/white are unreadable on a white field.
    xterm: {
      background: '#f8f9fb',
      foreground: '#1d2330',
      cursor: '#2f6fdf',
      cursorAccent: '#f8f9fb',
      selectionBackground: '#cfdcf7',
      black: '#24292f',
      red: '#c62a2a',
      green: '#16723f',
      yellow: '#7d5200',
      blue: '#0a63d1',
      magenta: '#8146d6',
      cyan: '#147680',
      white: '#6e7781',
      brightBlack: '#57606a',
      brightRed: '#a40e26',
      brightGreen: '#1a7f37',
      brightYellow: '#946200',
      brightBlue: '#2f7fe6',
      brightMagenta: '#9a62ea',
      brightCyan: '#2a8c99',
      brightWhite: '#8c959f'
    },
    monaco: 'daylight'
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    description: 'Light — warm off-white like a printed page, ink-dark type, terracotta accent.',
    xterm: {
      background: '#fbf9f4',
      foreground: '#2a2620',
      cursor: '#b0502a',
      cursorAccent: '#fbf9f4',
      selectionBackground: '#ecdac9',
      black: '#2a2620',
      red: '#b3302a',
      green: '#4a7526',
      yellow: '#865c00',
      blue: '#2f5f9e',
      magenta: '#8c4686',
      cyan: '#277570',
      white: '#857a6b',
      brightBlack: '#655b4e',
      brightRed: '#cc4530',
      brightGreen: '#5c8a30',
      brightYellow: '#a06f00',
      brightBlue: '#3d74bd',
      brightMagenta: '#a1579b',
      brightCyan: '#358c86',
      brightWhite: '#a0957f'
    },
    monaco: 'paper'
  }
}

export const THEME_LIST: ThemeDef[] = [
  THEMES.dark,
  THEMES.mono,
  THEMES.zone,
  THEMES.daylight,
  THEMES.paper,
  THEMES.totalcommander
]

export function isThemeId(v: string): v is ThemeId {
  return Object.prototype.hasOwnProperty.call(THEMES, v)
}

/** Resolve a theme id (built-in or custom) to the def the terminal + editor need. */
export function resolveTheme(id: string, customs: CustomTheme[]): ThemeDef {
  if (isThemeId(id)) return THEMES[id]
  const c = customs.find((t) => t.id === id)
  if (!c) return THEMES.dark
  return { id: 'dark', label: c.label, description: c.description, xterm: c.xterm, monaco: c.id }
}

/**
 * Reflect the active theme onto <html data-theme="…"> so the CSS overrides take effect. A
 * custom theme stamps "custom" and injects its tokens as a <style> (see theme/custom.ts).
 */
export function applyThemeToDom(id: string, customs: CustomTheme[] = []): void {
  if (isThemeId(id)) {
    applyCustomThemeCss(null)
    document.documentElement.dataset.theme = id
    return
  }
  const c = customs.find((t) => t.id === id)
  if (!c) {
    applyCustomThemeCss(null)
    document.documentElement.dataset.theme = 'dark'
    return
  }
  applyCustomThemeCss(c)
  document.documentElement.dataset.theme = CUSTOM_DOM_ID
}

export { isCustomThemeId }
