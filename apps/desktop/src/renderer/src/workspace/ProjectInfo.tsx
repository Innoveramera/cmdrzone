import { useEffect, useState } from 'react'
import type { ProjectNode } from '@shared/types'
import { useStore } from '../state/store'

const DOCS: { file: string; flag: (p: ProjectNode) => boolean; label: string }[] = [
  { file: 'README.md', flag: (p) => p.hasReadme, label: 'README' },
  { file: 'CLAUDE.md', flag: (p) => p.hasClaudeMd, label: 'CLAUDE.md' },
  { file: 'TASKS.md', flag: (p) => p.hasTasksMd, label: 'TASKS.md' }
]

export function ProjectInfo({ project }: { project: ProjectNode }) {
  const git = useStore((s) => s.gitByPath[project.path])
  const agents = useStore((s) => s.agents)
  const terminals = useStore((s) => s.terminals)
  const available = DOCS.filter((d) => d.flag(project))
  const [docFile, setDocFile] = useState<string | undefined>(available[0]?.file)
  const [doc, setDoc] = useState('')

  useEffect(() => {
    setDocFile(available[0]?.file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.path])

  useEffect(() => {
    if (docFile) window.api.fs.readFile(`${project.path}/${docFile}`).then(setDoc)
    else setDoc('')
  }, [docFile, project.path])

  useEffect(() => {
    void useStore.getState().loadGit(project.path)
  }, [project.path])

  const runScript = (name: string) => {
    useStore
      .getState()
      .newTerminal(project.id, { kind: 'devserver', title: name, initialCommand: `npm run ${name}` })
  }

  const scriptNames = project.scripts ? Object.keys(project.scripts) : []
  const running = Object.values(terminals).filter(
    (t) => t.projectId === project.id && t.port && !t.exited
  )
  const currentProvider = project.defaultProviderId ?? 'claude-code'
  const changeProvider = (id: string) => {
    void window.api.projects.setPref(project.path, 'defaultProviderId', id)
    void useStore.getState().refresh()
  }

  return (
    <div className="info">
      <div className="col-head">
        <span>Project</span>
        <button
          className="collapse-btn"
          title="Hide project panel"
          onClick={() => useStore.getState().toggleInfo()}
        >
          ›
        </button>
      </div>
      <div className="info-scroll">
        <div className="info-sec">
          <div className="info-head">Docs</div>
          <div className="doc-tabs">
            {available.map((d) => (
              <button
                key={d.file}
                className={`doc-tab ${docFile === d.file ? 'on' : ''}`}
                onClick={() => setDocFile(d.file)}
              >
                {d.label}
              </button>
            ))}
            {available.length === 0 && <span className="muted small">none</span>}
          </div>
          {doc && <pre className="doc">{doc.slice(0, 8000)}</pre>}
        </div>

        {running.length > 0 && (
          <div className="info-sec">
            <div className="info-head">Running</div>
            {running.map((t) => (
              <button
                key={t.id}
                className="port-chip"
                onClick={() => window.api.shell.openExternal(`http://localhost:${t.port}`)}
              >
                ↗ {t.title} · localhost:{t.port}
              </button>
            ))}
          </div>
        )}

        <div className="info-sec">
          <div className="info-head">Default agent</div>
          <select
            className="select"
            value={currentProvider}
            onChange={(e) => changeProvider(e.target.value)}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id} disabled={!a.installed}>
                {a.name}
                {a.installed ? '' : ' (not installed)'}
              </option>
            ))}
          </select>
        </div>

        {scriptNames.length > 0 && (
          <div className="info-sec">
            <div className="info-head">Scripts</div>
            <div className="scripts">
              {scriptNames.slice(0, 14).map((s) => (
                <button key={s} className="script" onClick={() => runScript(s)}>
                  ▷ {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="info-sec">
          <div className="info-head">Git</div>
          {git?.isRepo ? (
            <div className="small">
              ⎇ {git.branch} · ✎{git.dirty} changed
              {git.ahead ? ` · ↑${git.ahead}` : ''}
              {git.behind ? ` · ↓${git.behind}` : ''}
            </div>
          ) : (
            <div className="muted small">not a git repo</div>
          )}
        </div>

        <div className="info-sec">
          <div className="info-head">Env</div>
          <div className="small">
            {project.hasEnv ? '🔒 .env present (hidden)' : <span className="muted">no .env</span>}
          </div>
        </div>

        <div className="info-sec">
          <button className="ghost wide" onClick={() => window.api.shell.reveal(project.path)}>
            Reveal in Finder
          </button>
        </div>
      </div>
    </div>
  )
}
