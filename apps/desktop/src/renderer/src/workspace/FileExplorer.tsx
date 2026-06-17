import { useEffect, useState } from 'react'
import type { DirEntry } from '@shared/types'

function FileNode({
  entry,
  depth,
  onSelectFile,
  selectedPath
}: {
  entry: DirEntry
  depth: number
  onSelectFile?: (p: string) => void
  selectedPath?: string
}) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<DirEntry[] | null>(null)

  const onClick = async () => {
    if (entry.isDir) {
      if (entry.heavy) return
      if (!open && children === null) setChildren(await window.api.fs.readDir(entry.path))
      setOpen((o) => !o)
    } else if (onSelectFile) {
      onSelectFile(entry.path)
    } else {
      window.api.shell.reveal(entry.path)
    }
  }

  const sel = !entry.isDir && selectedPath === entry.path

  return (
    <div>
      <div
        className={`frow ${sel ? 'fsel' : ''}`}
        style={{ paddingLeft: depth * 12 + 10 }}
        onClick={onClick}
        title={entry.path}
      >
        <span className="fic">{entry.isDir ? (open ? '▾' : '▸') : '·'}</span>
        <span className={entry.heavy ? 'muted' : entry.isDir ? 'fdir' : ''}>{entry.name}</span>
      </div>
      {open &&
        children &&
        children.map((c) => (
          <FileNode
            key={c.path}
            entry={c}
            depth={depth + 1}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
          />
        ))}
    </div>
  )
}

export function FileExplorer({
  root,
  onSelectFile,
  selectedPath,
  title = 'Files'
}: {
  root: string
  onSelectFile?: (p: string) => void
  selectedPath?: string
  title?: string
}) {
  const [entries, setEntries] = useState<DirEntry[]>([])
  useEffect(() => {
    window.api.fs.readDir(root).then(setEntries)
  }, [root])
  return (
    <div className="explorer">
      <div className="col-head">{title}</div>
      <div className="ex-tree">
        {entries.map((e) => (
          <FileNode
            key={e.path}
            entry={e}
            depth={0}
            onSelectFile={onSelectFile}
            selectedPath={selectedPath}
          />
        ))}
      </div>
    </div>
  )
}
