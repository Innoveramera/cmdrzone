// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
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

function languageFromPath(path: string): string {
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
      theme: 'vs-dark',
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
