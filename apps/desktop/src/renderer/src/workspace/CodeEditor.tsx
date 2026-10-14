// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import { useStore } from '../state/store'
import { resolveTheme } from '../theme/themes'
import type { CustomTheme } from '../theme/custom'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Wire Monaco's language-service web workers (Vite bundles each via ?worker).
// Set once at module load.
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

// The Zone theme (themes.ts) goes grayscale all the way down: syntax highlighting
// becomes a gray ramp where brightness + weight carry what hue used to. Registered
// once at module load; THEMES.zone.monaco names it.
monaco.editor.defineTheme('zone', {
  base: 'vs-dark',
  inherit: false,
  rules: [
    { token: '', foreground: 'd6d6d6' },
    { token: 'comment', foreground: '6a6a6a', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ffffff', fontStyle: 'bold' },
    { token: 'string', foreground: 'b0b0b0' },
    { token: 'string.escape', foreground: 'd0d0d0' },
    { token: 'number', foreground: 'e8e8e8' },
    { token: 'regexp', foreground: 'c0c0c0' },
    { token: 'type', foreground: 'f0f0f0' },
    { token: 'type.identifier', foreground: 'f0f0f0' },
    { token: 'identifier', foreground: 'd6d6d6' },
    { token: 'delimiter', foreground: '8e8e8e' },
    { token: 'tag', foreground: 'f0f0f0' },
    { token: 'attribute.name', foreground: 'b8b8b8' },
    { token: 'attribute.value', foreground: 'b0b0b0' },
    { token: 'metatag', foreground: '8e8e8e' },
    { token: 'key', foreground: 'e0e0e0' },
    { token: 'string.key.json', foreground: 'e0e0e0' },
    { token: 'string.value.json', foreground: 'b0b0b0' },
    { token: 'variable', foreground: 'd6d6d6' },
    { token: 'constant', foreground: 'e8e8e8' },
    { token: 'namespace', foreground: 'c8c8c8' },
    { token: 'annotation', foreground: '9a9a9a' }
  ],
  colors: {
    'editor.background': '#131313',
    'editor.foreground': '#d6d6d6',
    'editor.lineHighlightBackground': '#1a1a1a',
    'editor.selectionBackground': '#383838',
    'editor.inactiveSelectionBackground': '#2a2a2a',
    'editorCursor.foreground': '#ffffff',
    'editorLineNumber.foreground': '#4a4a4a',
    'editorLineNumber.activeForeground': '#8c8c8c',
    'editorWidget.background': '#171717',
    'editorWidget.border': '#343434',
    'editorIndentGuide.background': '#242424',
    'editorGutter.background': '#131313',
    'minimap.background': '#111111',
    'editorBracketMatch.border': '#8c8c8c'
  }
})

// The light themes (themes.ts) sit on vs's light syntax colors; only the chrome is retinted
// so the editor well matches its panel instead of glaring pure white.
const lightChrome = (bg: string, fg: string, accent: string, line: string, sel: string, gutter: string, widget: string, border: string): monaco.editor.IStandaloneThemeData => ({
  base: 'vs',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': bg,
    'editor.foreground': fg,
    'editor.lineHighlightBackground': line,
    'editor.selectionBackground': sel,
    'editorCursor.foreground': accent,
    'editorLineNumber.foreground': gutter,
    'editorLineNumber.activeForeground': fg,
    'editorWidget.background': widget,
    'editorWidget.border': border,
    'editorGutter.background': bg,
    'minimap.background': bg
  }
})
monaco.editor.defineTheme('daylight', lightChrome('#f8f9fb', '#1d2330', '#2f6fdf', '#eef1f6', '#cfdcf7', '#a3abb8', '#ffffff', '#cbd1db'))
monaco.editor.defineTheme('paper', lightChrome('#fbf9f4', '#2a2620', '#b0502a', '#f2ede3', '#ecdac9', '#b3a893', '#f8f5ee', '#cbc0ad'))

// Custom themes are registered with Monaco on use, keyed by their id. They can be edited in
// place, so re-define every time (cheap, and re-registering the same id is harmless).
export function ensureMonacoTheme(themeId: string, customs: CustomTheme[]): string {
  const def = resolveTheme(themeId, customs)
  const c = customs.find((t) => t.id === themeId)
  if (c) monaco.editor.defineTheme(c.id, { base: c.monaco.base, inherit: true, rules: c.monaco.rules, colors: c.monaco.colors })
  return def.monaco
}

export function languageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    json: 'json', md: 'markdown', markdown: 'markdown',
    css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
    swift: 'swift', dart: 'dart', sql: 'sql', sh: 'shell', bash: 'shell',
    yml: 'yaml', yaml: 'yaml', toml: 'ini', xml: 'xml', php: 'php', c: 'c',
    h: 'cpp', cpp: 'cpp', cc: 'cpp', cs: 'csharp'
  }
  return map[ext] ?? 'plaintext'
}

export function CodeEditor({ path }: { path: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const edRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const pathRef = useRef(path)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  pathRef.current = path

  const save = async () => {
    const ed = edRef.current
    if (!ed) return
    setSaving(true)
    const ok = await window.api.fs.writeFile(pathRef.current, ed.getValue())
    setSaving(false)
    if (ok) setDirty(false)
  }
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!hostRef.current) return
    let disposed = false

    const ed = monaco.editor.create(hostRef.current, {
      value: '',
      language: languageFromPath(path),
      theme: ensureMonacoTheme(useStore.getState().theme, useStore.getState().customThemes),
      automaticLayout: true,
      fontSize: 13,
      fontFamily: 'Menlo, "SF Mono", monospace',
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
      renderWhitespace: 'selection'
    })
    edRef.current = ed

    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveRef.current())

    window.api.fs.readFile(path).then((content) => {
      if (disposed) return
      ed.setValue(content)
      setDirty(false)
      ed.onDidChangeModelContent(() => setDirty(true))
    })

    return () => {
      disposed = true
      ed.dispose()
      edRef.current = null
    }
  }, [path])

  // Monaco themes are global; re-apply when the user switches themes.
  const theme = useStore((s) => s.theme)
  const customThemes = useStore((s) => s.customThemes)
  useEffect(() => {
    monaco.editor.setTheme(ensureMonacoTheme(theme, customThemes))
  }, [theme, customThemes])

  return (
    <div className="editor">
      <div className="editor-head">
        <span className="editor-path">
          {path.split('/').slice(-2).join('/')}
          {dirty ? ' •' : ''}
        </span>
        <button className="mini" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save ⌘S'}
        </button>
      </div>
      <div className="editor-host" ref={hostRef} />
    </div>
  )
}
