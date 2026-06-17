import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { indentWithTab } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { python } from '@codemirror/lang-python'

function langForPath(path: string): Extension {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) {
    return javascript({ jsx: true, typescript: ext.startsWith('ts') })
  }
  if (ext === 'json') return json()
  if (['md', 'markdown'].includes(ext)) return markdown()
  if (['css', 'scss', 'less'].includes(ext)) return css()
  if (['html', 'htm'].includes(ext)) return html()
  if (ext === 'py') return python()
  return []
}

export function CodeEditor({ path }: { path: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const pathRef = useRef(path)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  pathRef.current = path

  const save = async () => {
    const view = viewRef.current
    if (!view) return
    setSaving(true)
    const ok = await window.api.fs.writeFile(pathRef.current, view.state.doc.toString())
    setSaving(false)
    if (ok) setDirty(false)
  }
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    if (!hostRef.current) return
    let disposed = false
    const view = new EditorView({ parent: hostRef.current })
    viewRef.current = view

    window.api.fs.readFile(path).then((content) => {
      if (disposed) return
      view.setState(
        EditorState.create({
          doc: content,
          extensions: [
            basicSetup,
            keymap.of([
              indentWithTab,
              {
                key: 'Mod-s',
                preventDefault: true,
                run: () => {
                  void saveRef.current()
                  return true
                }
              }
            ]),
            langForPath(path),
            oneDark,
            EditorView.updateListener.of((u) => {
              if (u.docChanged) setDirty(true)
            })
          ]
        })
      )
      setDirty(false)
    })

    return () => {
      disposed = true
      view.destroy()
      viewRef.current = null
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
