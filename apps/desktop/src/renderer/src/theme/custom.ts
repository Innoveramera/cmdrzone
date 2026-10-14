// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// Custom (user-imported) themes. Two sources, one shape:
//   1. A VS Code color theme (`*-color-theme.json`, JSONC allowed): its `colors` map to our
//      CSS tokens, `terminal.ansi*` to the xterm palette, and `tokenColors` (TextMate scopes)
//      to Monaco token rules.
//   2. The short palette format: { name, appearance, canvas, accent } — the rest is derived
//      (same idea as T3 Code's published-theme format). Also what "Create from colors" makes.
// A custom theme is applied by stamping <html data-theme="custom"> and injecting a <style>
// with the token overrides, so styles.css and the theme CSS files need no changes.

// ---------- color math ----------

type RGB = [number, number, number]

function parseHex(s: string | undefined): RGB | null {
  if (!s) return null
  const m = /^#?([0-9a-f]{3,8})$/i.exec(s.trim())
  if (!m) return null
  let h = m[1]!
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('')
  if (h.length < 6) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function hex(rgb: RGB): string {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

/** drop an 8-digit alpha suffix — CSS accepts it, Monaco token rules don't */
function solid(s: string): string {
  const rgb = parseHex(s)
  return rgb ? hex(rgb) : s
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function luminance([r, g, b]: RGB): number {
  const f = (c: number): number => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]

/** step a surface "up" (toward the text color) by t — works for light and dark grounds */
function lift(bg: RGB, dark: boolean, t: number): RGB {
  return mix(bg, dark ? WHITE : BLACK, t)
}

// ---------- shape ----------

export interface CustomXterm {
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

export interface CustomMonaco {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
  colors: Record<string, string>
  rules: { token: string; foreground?: string; fontStyle?: string }[]
}

export interface CustomTheme {
  /** always 'custom-<ts>' */
  id: string
  label: string
  description: string
  appearance: 'dark' | 'light'
  /** CSS custom properties, e.g. { '--bg': '#1a1b26' } */
  vars: Record<string, string>
  xterm: CustomXterm
  monaco: CustomMonaco
}

/** The exported/imported file format for CmdrZone themes. */
interface CzThemeFile extends Omit<CustomTheme, 'id'> {
  czTheme: 1
}

export const CUSTOM_DOM_ID = 'custom'
const STYLE_ID = 'cz-custom-theme'

export function isCustomThemeId(id: string): boolean {
  return id.startsWith('custom-')
}

// ---------- token derivation ----------

export const TOKEN_KEYS = [
  '--bg', '--panel', '--panel2', '--border', '--border2', '--text', '--muted', '--accent',
  '--blue', '--amber', '--green', '--red', '--hover', '--elev', '--sel', '--sel-strong',
  '--chip-bg', '--badge-bg', '--dim', '--viz-1', '--viz-2', '--viz-3', '--viz-4',
  '--viz-other', '--viz-seq', '--holo-1', '--holo-2'
] as const

export type TokenKey = (typeof TOKEN_KEYS)[number]

/** Every token, grouped and labeled for the color editor in Settings. */
export const TOKEN_GROUPS: { label: string; tokens: [TokenKey, string][] }[] = [
  {
    label: 'Surfaces',
    tokens: [
      ['--bg', 'Background'], ['--panel', 'Panels'], ['--panel2', 'Wells (editor, terminal)'],
      ['--elev', 'Raised'], ['--hover', 'Hover'], ['--sel', 'Selection'], ['--sel-strong', 'Selection, pressed'],
      ['--chip-bg', 'Chips'], ['--badge-bg', 'Badges']
    ]
  },
  {
    label: 'Text & lines',
    tokens: [
      ['--text', 'Text'], ['--muted', 'Muted text'], ['--dim', 'Dimmed glyphs'],
      ['--border', 'Borders'], ['--border2', 'Borders, strong']
    ]
  },
  {
    label: 'Accent & status',
    tokens: [
      ['--accent', 'Accent'], ['--blue', 'Links · working'], ['--amber', 'Warning · waiting'],
      ['--green', 'Success · done'], ['--red', 'Error']
    ]
  },
  {
    label: 'Charts & home',
    tokens: [
      ['--viz-1', 'Chart 1'], ['--viz-2', 'Chart 2'], ['--viz-3', 'Chart 3'], ['--viz-4', 'Chart 4'],
      ['--viz-other', 'Chart, other'], ['--viz-seq', 'Chart bars'], ['--holo-1', 'Glow 1'], ['--holo-2', 'Glow 2']
    ]
  }
]

/**
 * Derive the full token set from a canvas + accent (+ optional overrides). Every token has
 * a value afterwards, so a theme built this way never falls back to the dark defaults.
 */
export function deriveTokens(
  canvasHex: string,
  accentHex: string,
  appearance: 'dark' | 'light',
  overrides: Partial<Record<TokenKey, string>> = {}
): Record<string, string> {
  const canvas = parseHex(canvasHex) ?? (appearance === 'dark' ? [11, 13, 18] : [250, 250, 250])
  const accent = parseHex(accentHex) ?? (appearance === 'dark' ? [155, 180, 255] : [40, 90, 220])
  const dark = appearance === 'dark'
  const text = dark ? mix(WHITE, canvas, 0.14) : mix(BLACK, canvas, 0.12)
  const panel = lift(canvas, dark, 0.04)
  const derived: Record<string, string> = {
    '--bg': hex(canvas),
    '--panel': hex(panel),
    '--panel2': hex(lift(canvas, dark, 0.02)),
    '--border': hex(lift(canvas, dark, 0.11)),
    '--border2': hex(lift(canvas, dark, 0.18)),
    '--text': hex(text),
    '--muted': hex(mix(text, canvas, 0.48)),
    '--accent': hex(accent),
    '--blue': hex(accent),
    '--amber': dark ? '#e5c07b' : '#b8860b',
    '--green': dark ? '#57d9a3' : '#1f9d5a',
    '--red': dark ? '#ff6b6b' : '#d03a3a',
    '--hover': hex(lift(canvas, dark, 0.05)),
    '--elev': hex(lift(canvas, dark, 0.07)),
    '--sel': hex(mix(canvas, accent, dark ? 0.2 : 0.16)),
    '--sel-strong': hex(mix(canvas, accent, dark ? 0.3 : 0.24)),
    '--chip-bg': hex(lift(canvas, dark, 0.08)),
    '--badge-bg': hex(lift(canvas, dark, 0.07)),
    '--dim': hex(mix(text, canvas, 0.72)),
    '--viz-1': hex(accent),
    '--viz-2': dark ? '#199e70' : '#1baf7a',
    '--viz-3': dark ? '#c98500' : '#eda100',
    '--viz-4': dark ? '#9085e9' : '#4a3aa7',
    '--viz-other': hex(mix(text, canvas, 0.6)),
    '--viz-seq': hex(accent),
    '--holo-1': hex(accent),
    '--holo-2': hex(mix(accent, dark ? WHITE : BLACK, 0.35))
  }
  for (const k of TOKEN_KEYS) if (overrides[k]) derived[k] = solid(overrides[k]!)
  return derived
}

function deriveXterm(vars: Record<string, string>, appearance: 'dark' | 'light'): CustomXterm {
  return {
    background: vars['--panel2'] ?? vars['--bg']!,
    foreground: vars['--text']!,
    cursor: vars['--accent']!,
    selectionBackground: vars['--sel']!,
    ...(appearance === 'light'
      ? { black: '#000000', white: '#bbbbbb', brightBlack: '#555555', brightWhite: '#ffffff' }
      : {})
  }
}

function deriveMonaco(vars: Record<string, string>, appearance: 'dark' | 'light'): CustomMonaco {
  return {
    base: appearance === 'dark' ? 'vs-dark' : 'vs',
    colors: {
      'editor.background': vars['--panel2']!,
      'editor.foreground': vars['--text']!,
      'editorLineNumber.foreground': vars['--dim']!,
      'editorLineNumber.activeForeground': vars['--muted']!,
      'editor.selectionBackground': vars['--sel']!,
      'editor.lineHighlightBackground': vars['--hover']!,
      'editorCursor.foreground': vars['--accent']!,
      'editorWidget.background': vars['--panel']!,
      'editorWidget.border': vars['--border2']!,
      'editorGutter.background': vars['--panel2']!,
      'minimap.background': vars['--panel2']!,
      'diffEditor.insertedTextBackground': appearance === 'dark' ? '#57d9a326' : '#1f9d5a22',
      'diffEditor.removedTextBackground': appearance === 'dark' ? '#ff6b6b26' : '#d03a3a22'
    },
    rules: []
  }
}

/** The t3-style short format → a complete theme. */
export function themeFromPalette(opts: {
  name: string
  appearance: 'dark' | 'light'
  canvas: string
  accent: string
  colors?: Record<string, string>
}): CustomTheme {
  const vars = deriveTokens(opts.canvas, opts.accent, opts.appearance, (opts.colors ?? {}) as Partial<Record<TokenKey, string>>)
  return {
    id: `custom-${Date.now()}`,
    label: opts.name.trim() || 'Custom',
    description: `${opts.appearance === 'dark' ? 'Dark' : 'Light'} · canvas ${solid(opts.canvas)} · accent ${solid(opts.accent)}.`,
    appearance: opts.appearance,
    vars,
    xterm: deriveXterm(vars, opts.appearance),
    monaco: deriveMonaco(vars, opts.appearance)
  }
}

/**
 * Re-color an existing theme from the editor. Tokens, terminal ground and editor chrome follow
 * the new palette; an imported theme keeps its ANSI colors and syntax rules.
 */
export function rebuildTheme(
  prev: CustomTheme,
  opts: { name: string; appearance: 'dark' | 'light'; canvas: string; accent: string; colors?: Record<string, string> }
): CustomTheme {
  const next = themeFromPalette(opts)
  const { background: _b, foreground: _f, cursor: _c, cursorAccent: _ca, selectionBackground: _s, ...ansi } = prev.xterm
  void [_b, _f, _c, _ca, _s]
  const keepAnsi = prev.appearance === opts.appearance ? ansi : {}
  return {
    ...next,
    id: prev.id,
    xterm: { ...keepAnsi, ...next.xterm },
    monaco: {
      ...next.monaco,
      colors: { ...(prev.appearance === opts.appearance ? prev.monaco.colors : {}), ...next.monaco.colors },
      rules: prev.appearance === opts.appearance ? prev.monaco.rules : []
    }
  }
}

// ---------- VS Code import ----------

// Strip line + block comments and trailing commas from JSONC (theme files use both).
export function parseJsonc(text: string): unknown {
  let out = ''
  let i = 0
  let inStr = false
  while (i < text.length) {
    const c = text[i]!
    const n = text[i + 1]
    if (inStr) {
      out += c
      if (c === '\\') {
        out += n ?? ''
        i += 2
        continue
      }
      if (c === '"') inStr = false
      i++
      continue
    }
    if (c === '"') {
      inStr = true
      out += c
      i++
      continue
    }
    if (c === '/' && n === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (c === '/' && n === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  out = out.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(out.replace(/^﻿/, ''))
}

interface VsTokenColor {
  scope?: string | string[]
  settings?: { foreground?: string; fontStyle?: string }
}

interface VsTheme {
  name?: string
  type?: string
  colors?: Record<string, string>
  tokenColors?: VsTokenColor[]
}

// TextMate scope prefix → Monaco token. First match on the longest prefix wins.
const SCOPE_MAP: [string, string][] = [
  ['comment', 'comment'],
  ['punctuation.definition.comment', 'comment'],
  ['string.regexp', 'regexp'],
  ['string', 'string'],
  ['constant.numeric', 'number'],
  ['constant.language', 'constant'],
  ['constant.character', 'string.escape'],
  ['constant', 'constant'],
  ['keyword.operator', 'delimiter'],
  ['keyword', 'keyword'],
  ['storage.type', 'keyword'],
  ['storage.modifier', 'keyword'],
  ['storage', 'keyword'],
  ['entity.name.type', 'type'],
  ['entity.name.class', 'type'],
  ['support.type', 'type'],
  ['support.class', 'type'],
  ['entity.name.tag', 'tag'],
  ['entity.other.attribute-name', 'attribute.name'],
  ['entity.name.function', 'identifier'],
  ['support.function', 'identifier'],
  ['variable', 'variable'],
  ['meta.object-literal.key', 'key'],
  ['support.type.property-name.json', 'string.key.json'],
  ['punctuation', 'delimiter'],
  ['meta.tag', 'metatag'],
  ['markup.heading', 'keyword'],
  ['meta.decorator', 'annotation']
]

function monacoRulesFrom(tokenColors: VsTokenColor[] | undefined): CustomMonaco['rules'] {
  const rules = new Map<string, { token: string; foreground?: string; fontStyle?: string }>()
  // How specific the winning scope was: 0 = exact match on the map key ('variable'); larger =
  // a narrower sub-scope ('variable.language'). The most general scope best represents a token.
  const spec = new Map<string, number>()
  for (const tc of tokenColors ?? []) {
    const fg = tc.settings?.foreground
    const fs = tc.settings?.fontStyle
    if (!fg && !fs) continue
    const scopes = Array.isArray(tc.scope) ? tc.scope : typeof tc.scope === 'string' ? tc.scope.split(',') : []
    for (const raw of scopes) {
      const scope = raw.trim()
      if (!scope) continue
      let best: [string, string] | null = null
      for (const m of SCOPE_MAP) {
        if ((scope === m[0] || scope.startsWith(m[0] + '.')) && (!best || m[0].length > best[0].length)) best = m
      }
      if (!best) continue
      const token = best[1]
      const specificity = scope.length - best[0].length
      const prev = spec.get(token)
      if (prev !== undefined && prev <= specificity) continue
      spec.set(token, specificity)
      const rule: { token: string; foreground?: string; fontStyle?: string } = { token }
      if (fg && parseHex(fg)) rule.foreground = solid(fg).slice(1)
      if (fs) rule.fontStyle = fs
      rules.set(token, rule)
    }
  }
  return [...rules.values()]
}

/**
 * Turn a VS Code color theme into a CustomTheme. Throws with a readable message when the
 * file isn't a theme. Missing colors are derived from editor.background + the accent.
 */
export function themeFromVsCode(json: unknown, fallbackName: string): CustomTheme {
  const t = (json ?? {}) as VsTheme
  const colors = t.colors ?? {}
  if (!t.colors && !t.tokenColors) throw new Error('Not a VS Code color theme (no "colors" or "tokenColors").')
  const editorBg = colors['editor.background'] ?? (t.type === 'light' ? '#ffffff' : '#1e1e1e')
  const bgRgb = parseHex(editorBg) ?? [30, 30, 30]
  const appearance: 'dark' | 'light' =
    t.type === 'light' || t.type === 'hc-light' ? 'light' : t.type === 'dark' || t.type === 'hc-black' ? 'dark' : luminance(bgRgb) > 0.4 ? 'light' : 'dark'
  const dark = appearance === 'dark'
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = colors[k]
      if (v && parseHex(v)) return solid(v)
    }
    return undefined
  }
  // Badge / button / link colors are the theme's real accent; focusBorder is often a dull outline.
  const accent = pick('activityBarBadge.background', 'button.background', 'textLink.foreground', 'progressBar.background', 'focusBorder') ?? (dark ? '#9bb4ff' : '#285ad8')
  const canvas = pick('activityBar.background', 'titleBar.activeBackground', 'sideBar.background') ?? hex(lift(bgRgb, dark, -0.03))
  const vars = deriveTokens(canvas, accent, appearance, {
    '--panel': pick('sideBar.background', 'editorGroupHeader.tabsBackground'),
    '--panel2': solid(editorBg),
    '--border': pick('panel.border', 'sideBar.border', 'editorGroup.border', 'tab.border'),
    '--text': pick('editor.foreground', 'foreground'),
    '--muted': pick('descriptionForeground', 'sideBarSectionHeader.foreground', 'tab.inactiveForeground'),
    '--blue': pick('textLink.foreground', 'terminal.ansiBlue'),
    '--amber': pick('editorWarning.foreground', 'list.warningForeground', 'terminal.ansiYellow'),
    '--green': pick('gitDecoration.addedResourceForeground', 'terminal.ansiGreen'),
    '--red': pick('editorError.foreground', 'terminal.ansiRed', 'gitDecoration.deletedResourceForeground', 'errorForeground'),
    '--hover': pick('list.hoverBackground'),
    '--elev': pick('editorWidget.background', 'dropdown.background'),
    '--sel': pick('list.activeSelectionBackground', 'editor.selectionBackground'),
    '--chip-bg': pick('input.background', 'badge.background'),
    '--badge-bg': pick('input.background'),
    '--viz-1': pick('terminal.ansiBlue'),
    '--viz-2': pick('terminal.ansiGreen'),
    '--viz-3': pick('terminal.ansiYellow'),
    '--viz-4': pick('terminal.ansiMagenta'),
    '--viz-seq': pick('terminal.ansiBlue'),
    '--holo-1': pick('terminal.ansiCyan'),
    '--holo-2': pick('terminal.ansiMagenta')
  })
  // Some themes draw near-invisible panel borders; keep ours a visible step above the ground.
  const bgL = luminance(parseHex(vars['--bg']!) ?? bgRgb)
  if (Math.abs(luminance(parseHex(vars['--border']!) ?? bgRgb) - bgL) < 0.008) {
    vars['--border'] = hex(lift(parseHex(vars['--bg']!) ?? bgRgb, dark, 0.11))
  }
  // --border2 must sit above --border; derive from the (possibly overridden) border.
  vars['--border2'] = hex(lift(parseHex(vars['--border']!) ?? bgRgb, dark, 0.1))
  // --sel-strong follows --sel; --dim follows --muted.
  vars['--sel-strong'] = hex(lift(parseHex(vars['--sel']!) ?? bgRgb, dark, 0.08))
  vars['--dim'] = hex(mix(parseHex(vars['--muted']!) ?? bgRgb, parseHex(vars['--bg']!) ?? bgRgb, 0.45))

  const xterm: CustomXterm = {
    background: pick('terminal.background') ?? solid(editorBg),
    foreground: pick('terminal.foreground', 'editor.foreground') ?? vars['--text']!,
    cursor: pick('terminalCursor.foreground', 'editorCursor.foreground') ?? vars['--accent']!,
    cursorAccent: pick('terminalCursor.background'),
    selectionBackground: pick('terminal.selectionBackground', 'editor.selectionBackground') ?? vars['--sel']!
  }
  const ansi: [keyof CustomXterm, string][] = [
    ['black', 'terminal.ansiBlack'], ['red', 'terminal.ansiRed'], ['green', 'terminal.ansiGreen'],
    ['yellow', 'terminal.ansiYellow'], ['blue', 'terminal.ansiBlue'], ['magenta', 'terminal.ansiMagenta'],
    ['cyan', 'terminal.ansiCyan'], ['white', 'terminal.ansiWhite'], ['brightBlack', 'terminal.ansiBrightBlack'],
    ['brightRed', 'terminal.ansiBrightRed'], ['brightGreen', 'terminal.ansiBrightGreen'],
    ['brightYellow', 'terminal.ansiBrightYellow'], ['brightBlue', 'terminal.ansiBrightBlue'],
    ['brightMagenta', 'terminal.ansiBrightMagenta'], ['brightCyan', 'terminal.ansiBrightCyan'],
    ['brightWhite', 'terminal.ansiBrightWhite']
  ]
  for (const [k, key] of ansi) {
    const v = pick(key)
    if (v) (xterm as unknown as Record<string, string | undefined>)[k] = v
  }

  // Monaco takes VS Code's color keys as-is (it IS the VS Code editor) — pass the solid ones.
  const monacoColors: Record<string, string> = {}
  for (const [k, v] of Object.entries(colors)) {
    if (typeof v === 'string' && parseHex(v) && (k.startsWith('editor') || k.startsWith('minimap') || k.startsWith('diffEditor') || k.startsWith('scrollbar') || k.startsWith('widget') || k.startsWith('input') || k.startsWith('list') || k.startsWith('focusBorder') || k.startsWith('selection'))) {
      monacoColors[k] = v
    }
  }
  const monaco: CustomMonaco = {
    base: t.type === 'hc-black' ? 'hc-black' : t.type === 'hc-light' ? 'hc-light' : dark ? 'vs-dark' : 'vs',
    colors: { ...deriveMonaco(vars, appearance).colors, ...monacoColors },
    rules: monacoRulesFrom(t.tokenColors)
  }
  const name = (t.name || fallbackName.replace(/(-color-theme)?\.jsonc?$/i, '')).trim()
  return {
    id: `custom-${Date.now()}`,
    label: name || 'Imported theme',
    description: `Imported from VS Code · ${dark ? 'dark' : 'light'}.`,
    appearance,
    vars,
    xterm,
    monaco
  }
}

// ---------- import / export ----------

/** Parse any supported theme file. */
export function importThemeFile(name: string, content: string): CustomTheme {
  let json: unknown
  try {
    json = parseJsonc(content)
  } catch {
    throw new Error('The file is not valid JSON.')
  }
  const j = json as Partial<CzThemeFile> & {
    canvas?: string
    accent?: string
    appearance?: string
    name?: string
    colors?: Record<string, string>
    tokenColors?: unknown
  }
  if (j && j.czTheme === 1 && j.vars && j.xterm && j.monaco) {
    return { ...(j as CzThemeFile), id: `custom-${Date.now()}` }
  }
  if (j && typeof j.canvas === 'string' && typeof j.accent === 'string' && !j.tokenColors && !(j.colors && j.colors['editor.background'])) {
    return themeFromPalette({
      name: j.name ?? name,
      appearance: j.appearance === 'light' ? 'light' : 'dark',
      canvas: j.canvas,
      accent: j.accent,
      colors: j.colors
    })
  }
  return themeFromVsCode(json, name)
}

export function exportThemeFile(t: CustomTheme): string {
  const { id: _id, ...rest } = t
  void _id
  const file: CzThemeFile = { czTheme: 1, ...rest }
  return JSON.stringify(file, null, 2)
}

// ---------- persistence + apply ----------

const STORAGE_KEY = 'customThemes'

export function serializeCustomThemes(list: CustomTheme[]): string {
  return JSON.stringify(list)
}

export function parseCustomThemes(raw: string): CustomTheme[] {
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (t): t is CustomTheme =>
        !!t && typeof t === 'object' && typeof (t as CustomTheme).id === 'string' && !!(t as CustomTheme).vars && !!(t as CustomTheme).xterm
    )
  } catch {
    return []
  }
}

export { STORAGE_KEY as CUSTOM_THEMES_KEY }

/** Inject (or remove) the <style> that carries a custom theme's tokens. Also drives the color
    editor's live preview, hence only the token half of a theme is needed. */
export function applyCustomThemeCss(t: Pick<CustomTheme, 'vars' | 'appearance'> | null): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!t) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  const decls = Object.entries(t.vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  el.textContent = `html[data-theme="${CUSTOM_DOM_ID}"] {\n${decls}\n  color-scheme: ${t.appearance};\n}\n`
}
