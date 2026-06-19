// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useRef, useState } from 'react'
import type { ProjectNode, BoardCard, BoardColumn, CardType } from '@shared/types'
import { useStore } from '../state/store'
import { composePrompt } from '../lib/prompt'

const TYPES: { key: CardType; label: string; emoji: string; cls: string }[] = [
  { key: 'idea', label: 'Idea', emoji: '💡', cls: 'ct-idea' },
  { key: 'feature', label: 'Feature', emoji: '✨', cls: 'ct-feature' },
  { key: 'bug', label: 'Bug', emoji: '🐞', cls: 'ct-bug' },
  { key: 'task', label: 'Task', emoji: '☑', cls: 'ct-task' }
]
const typeMeta = (t: CardType) => TYPES.find((x) => x.key === t) ?? TYPES[0]!

let seq = 0
const uid = (p: string) => `${p}-${Date.now()}-${++seq}`

// Compact relative time for the card footer (e.g. "just now", "3h ago", "2w ago").
function relativeTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 45) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

// Single-line-ish preview of a card's notes for the card face.
const snippet = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 160)

// Where a dragged card will land: before `beforeId`, or at the column end when null.
type DropAt = { colId: string; beforeId: string | null }

export function ProjectBoard({ project }: { project: ProjectNode }) {
  const [columns, setColumns] = useState<BoardColumn[]>([])
  const [cards, setCards] = useState<BoardCard[]>([])
  const [editing, setEditing] = useState<BoardCard | null>(null)
  const [launching, setLaunching] = useState<BoardCard | null>(null)
  const dragId = useRef<string | null>(null)
  // Re-render-driven drag UI: which card is in flight + where it would drop.
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<DropAt | null>(null)

  const claude = useStore((s) => s.agents.find((a) => a.id === 'claude-code'))
  const claudeReady = !!claude?.installed && !!claude.path

  useEffect(() => {
    let alive = true
    const load = (): void => {
      window.api.board.get(project.path).then((d) => {
        if (!alive) return
        setColumns(d.columns)
        setCards(d.cards)
      })
    }
    load()
    // External writers (the cmdrzone CLI/MCP) can change the board while the app is open;
    // re-pull when the window regains focus so agent-created cards appear.
    window.addEventListener('focus', load)
    return () => {
      alive = false
      window.removeEventListener('focus', load)
    }
  }, [project.path])

  const cardsIn = (colId: string) =>
    cards.filter((c) => c.columnId === colId).sort((a, b) => a.position - b.position)

  const addCard = (colId: string, title: string) => {
    const t = title.trim()
    if (!t) return
    const now = Date.now()
    const max = Math.max(0, ...cardsIn(colId).map((c) => c.position))
    const card: BoardCard = {
      id: uid('card'),
      projectPath: project.path,
      columnId: colId,
      title: t,
      body: '',
      type: 'idea',
      position: max + 1,
      createdAt: now,
      updatedAt: now
    }
    setCards((cs) => [...cs, card])
    void window.api.board.saveCard(card)
  }

  const updateCard = (card: BoardCard) => {
    const updated = { ...card, updatedAt: Date.now() }
    setCards((cs) => cs.map((c) => (c.id === card.id ? updated : c)))
    void window.api.board.saveCard(updated)
  }

  const removeCard = (id: string) => {
    setCards((cs) => cs.filter((c) => c.id !== id))
    void window.api.board.deleteCard(id)
    setEditing(null)
  }

  const moveCard = (id: string, toColId: string, beforeCardId?: string) => {
    const card = cards.find((c) => c.id === id)
    if (!card) return
    const target = cardsIn(toColId).filter((c) => c.id !== id)
    let position: number
    if (beforeCardId) {
      const idx = target.findIndex((c) => c.id === beforeCardId)
      const at = target[idx]
      const before = target[idx - 1]
      position = before && at ? (before.position + at.position) / 2 : at ? at.position - 1 : 1
    } else {
      position = (target.length ? Math.max(...target.map((c) => c.position)) : 0) + 1
    }
    const updated = { ...card, columnId: toColId, position, updatedAt: Date.now() }
    setCards((cs) => cs.map((c) => (c.id === id ? updated : c)))
    void window.api.board.saveCard(updated)
  }

  const beginDrag = (id: string) => {
    dragId.current = id
    setDragging(id)
  }
  const endDrag = () => {
    dragId.current = null
    setDragging(null)
    setDropAt(null)
  }
  // Commit a drop using the live drop indicator position (set during dragover).
  const commitDrop = () => {
    const id = dragId.current
    if (id && dropAt) moveCard(id, dropAt.colId, dropAt.beforeId ?? undefined)
    endDrag()
  }

  const addColumn = () => {
    const now = Date.now()
    const max = Math.max(0, ...columns.map((c) => c.position))
    const col: BoardColumn = {
      id: uid('col'),
      projectPath: project.path,
      title: 'New list',
      position: max + 1,
      createdAt: now
    }
    setColumns((cs) => [...cs, col])
    void window.api.board.saveColumn(col)
  }
  const renameColumn = (col: BoardColumn, title: string) => {
    const updated = { ...col, title: title.trim() || col.title }
    setColumns((cs) => cs.map((c) => (c.id === col.id ? updated : c)))
    void window.api.board.saveColumn(updated)
  }
  const deleteColumn = (id: string) => {
    setColumns((cs) => cs.filter((c) => c.id !== id))
    setCards((cs) => cs.filter((c) => c.columnId !== id))
    void window.api.board.deleteColumn(id)
  }

  // Launch a Claude session seeded with the card prompt; move card to "In Progress" if present.
  const launch = (card: BoardCard, promptText: string) => {
    if (!claude?.installed || !claude.path) return
    useStore.getState().setDetailMode('terminals')
    useStore.getState().newTerminal(project.id, {
      kind: 'agent',
      providerId: 'claude-code',
      title: card.title.slice(0, 24) || 'Claude',
      spawn: { command: claude.path, args: [promptText] }
    })
    const ip = columns.find((c) => c.title.trim().toLowerCase() === 'in progress')
    if (ip && card.columnId !== ip.id) moveCard(card.id, ip.id)
    setLaunching(null)
    setEditing(null)
  }

  const sorted = [...columns].sort((a, b) => a.position - b.position)

  return (
    <div className="board">
      {sorted.map((col) => (
        <BoardColumnView
          key={col.id}
          col={col}
          cards={cardsIn(col.id)}
          dragging={dragging}
          dropAt={dropAt}
          launchReady={claudeReady}
          onAddCard={(t) => addCard(col.id, t)}
          onRename={(t) => renameColumn(col, t)}
          onDelete={() => deleteColumn(col.id)}
          onCardClick={(c) => setEditing(c)}
          onLaunch={(c) => setLaunching(c)}
          onBeginDrag={beginDrag}
          onEndDrag={endDrag}
          onHover={setDropAt}
          onCommitDrop={commitDrop}
        />
      ))}
      <button className="board-add-col" onClick={addColumn}>
        ＋ Add list
      </button>

      {editing && (
        <CardEditor
          card={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            updateCard(c)
            setEditing(null)
          }}
          onDelete={() => removeCard(editing.id)}
          onStart={(c) => {
            updateCard(c)
            setEditing(null)
            setLaunching(c)
          }}
        />
      )}

      {launching && (
        <LaunchPreview
          card={launching}
          projectName={project.name}
          ready={claudeReady}
          onLaunch={(prompt) => launch(launching, prompt)}
          onClose={() => setLaunching(null)}
        />
      )}
    </div>
  )
}

function BoardColumnView(props: {
  col: BoardColumn
  cards: BoardCard[]
  dragging: string | null
  dropAt: DropAt | null
  launchReady: boolean
  onAddCard: (t: string) => void
  onRename: (t: string) => void
  onDelete: () => void
  onCardClick: (c: BoardCard) => void
  onLaunch: (c: BoardCard) => void
  onBeginDrag: (id: string) => void
  onEndDrag: () => void
  onHover: (at: DropAt) => void
  onCommitDrop: () => void
}) {
  const { col, cards, dragging, dropAt } = props
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(col.title)

  const isDragActive = dragging != null
  // The drop line for this column lands before `dropAt.beforeId` (or at the end when null).
  const dropHere = isDragActive && dropAt?.colId === col.id
  const lineFor = (beforeId: string | null) =>
    dropHere && dropAt?.beforeId === beforeId ? <div className="drop-line" /> : null

  return (
    <div
      className={`board-col${dropHere ? ' drag-over' : ''}`}
      onDragOver={(e) => {
        if (!isDragActive) return
        e.preventDefault()
        // Hovering the column's own padding (not a card) → drop at the end.
        props.onHover({ colId: col.id, beforeId: null })
      }}
      onDrop={(e) => {
        e.preventDefault()
        props.onCommitDrop()
      }}
    >
      <div className="board-col-head">
        {renaming ? (
          <input
            className="board-col-rename"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              props.onRename(title)
              setRenaming(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                props.onRename(title)
                setRenaming(false)
              }
            }}
          />
        ) : (
          <span className="board-col-title" onClick={() => setRenaming(true)}>
            {col.title}
          </span>
        )}
        <span className="board-col-count">{cards.length}</span>
        <span className="board-col-del" title="Delete list" onClick={props.onDelete}>
          ×
        </span>
      </div>

      <div className="board-col-cards">
        {cards.map((c, i) => (
          <div
            key={c.id}
            className="board-card-slot"
            // The slot's top-gap belongs to this card → hovering it means "drop before".
            onDragOver={(e) => {
              if (!isDragActive) return
              e.preventDefault()
              e.stopPropagation()
              props.onHover({ colId: col.id, beforeId: c.id })
            }}
          >
            {lineFor(c.id)}
            <BoardCardView
              card={c}
              isDragging={dragging === c.id}
              launchReady={props.launchReady}
              onClick={() => props.onCardClick(c)}
              onLaunch={() => props.onLaunch(c)}
              onBeginDrag={() => props.onBeginDrag(c.id)}
              onEndDrag={props.onEndDrag}
              onHover={(half) => {
                // Top half → insert before this card; bottom half → before the next one.
                const next = cards[i + 1]
                const beforeId = half === 'top' ? c.id : next ? next.id : null
                props.onHover({ colId: col.id, beforeId })
              }}
            />
          </div>
        ))}
        {dropHere && dropAt?.beforeId === null && <div className="drop-line drop-line-end" />}
        {cards.length === 0 && !isDragActive && <div className="board-col-empty">No cards yet</div>}
      </div>

      {adding ? (
        <div className="board-add">
          <textarea
            autoFocus
            value={text}
            placeholder="Card title…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                props.onAddCard(text)
                setText('')
              } else if (e.key === 'Escape') {
                setAdding(false)
                setText('')
              }
            }}
          />
          <div className="board-add-row">
            <button
              onClick={() => {
                props.onAddCard(text)
                setText('')
              }}
            >
              Add
            </button>
            <button
              className="ghost"
              onClick={() => {
                setAdding(false)
                setText('')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="board-add-card" onClick={() => setAdding(true)}>
          ＋ Add a card
        </button>
      )}
    </div>
  )
}

function BoardCardView(props: {
  card: BoardCard
  isDragging: boolean
  launchReady: boolean
  onClick: () => void
  onLaunch: () => void
  onBeginDrag: () => void
  onEndDrag: () => void
  onHover: (half: 'top' | 'bottom') => void
}) {
  const { card } = props
  const tm = typeMeta(card.type)
  const preview = card.body ? snippet(card.body) : ''
  return (
    <div
      className={`board-card${props.isDragging ? ' dragging' : ''}`}
      data-type={card.type}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        props.onBeginDrag()
      }}
      onDragEnd={props.onEndDrag}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (props.isDragging) return
        const r = e.currentTarget.getBoundingClientRect()
        props.onHover(e.clientY < r.top + r.height / 2 ? 'top' : 'bottom')
      }}
      onClick={props.onClick}
    >
      <div className="board-card-head">
        <span className={`ctag ${tm.cls}`}>
          {tm.emoji} {tm.label}
        </span>
        {props.launchReady && (
          <button
            className="card-launch"
            title="Start a Claude session from this card"
            onClick={(e) => {
              e.stopPropagation()
              props.onLaunch()
            }}
          >
            ▶
          </button>
        )}
      </div>
      <div className="board-card-title">{card.title}</div>
      {preview ? <div className="board-card-body">{preview}</div> : null}
      <div className="board-card-foot">
        <span className="card-time">{relativeTime(card.updatedAt)}</span>
        {card.body ? (
          <span className="card-note" title="Has notes">
            📝
          </span>
        ) : null}
      </div>
    </div>
  )
}

function CardEditor(props: {
  card: BoardCard
  onClose: () => void
  onSave: (c: BoardCard) => void
  onDelete: () => void
  onStart: (c: BoardCard) => void
}) {
  const [title, setTitle] = useState(props.card.title)
  const [body, setBody] = useState(props.card.body)
  const [type, setType] = useState<CardType>(props.card.type)
  const edited = (): BoardCard => ({ ...props.card, title: title.trim() || props.card.title, body, type })

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <input
          className="modal-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <div className="type-row">
          {TYPES.map((t) => (
            <button
              key={t.key}
              className={`ctag ${t.cls} ${type === t.key ? 'on' : ''}`}
              onClick={() => setType(t.key)}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
        <textarea
          className="modal-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Notes / details…"
        />
        <div className="modal-actions">
          <button className="primary" onClick={() => props.onStart(edited())}>
            ▶ Start session
          </button>
          <button onClick={() => props.onSave(edited())}>Save</button>
          <button className="ghost" onClick={props.onClose}>
            Cancel
          </button>
          <span className="spacer" />
          <button className="danger" onClick={props.onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function LaunchPreview(props: {
  card: BoardCard
  projectName: string
  ready: boolean
  onLaunch: (prompt: string) => void
  onClose: () => void
}) {
  const [prompt, setPrompt] = useState(() => composePrompt(props.card))
  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="launch-head">
          ▶ Start Claude session · <b>{props.projectName}</b>
        </div>
        <textarea
          className="modal-body launch-prompt"
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt…"
        />
        {!props.ready && (
          <div className="launch-warn small">
            ⚠ Claude Code not found on your PATH — install it or check the agent list.
          </div>
        )}
        <div className="modal-actions">
          <button
            className="primary"
            disabled={!props.ready || !prompt.trim()}
            onClick={() => props.onLaunch(prompt)}
          >
            ▶ Launch session
          </button>
          <button className="ghost" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
