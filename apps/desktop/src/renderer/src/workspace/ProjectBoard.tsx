// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { ProjectNode, BoardCard, BoardColumn, CardType } from '@shared/types'

const TYPES: { key: CardType; label: string; emoji: string; cls: string }[] = [
  { key: 'idea', label: 'Idea', emoji: '💡', cls: 'ct-idea' },
  { key: 'feature', label: 'Feature', emoji: '✨', cls: 'ct-feature' },
  { key: 'bug', label: 'Bug', emoji: '🐞', cls: 'ct-bug' },
  { key: 'task', label: 'Task', emoji: '☑', cls: 'ct-task' }
]
const typeMeta = (t: CardType) => TYPES.find((x) => x.key === t) ?? TYPES[0]!

let seq = 0
const uid = (p: string) => `${p}-${Date.now()}-${++seq}`

export function ProjectBoard({ project }: { project: ProjectNode }) {
  const [columns, setColumns] = useState<BoardColumn[]>([])
  const [cards, setCards] = useState<BoardCard[]>([])
  const [editing, setEditing] = useState<BoardCard | null>(null)
  const dragId = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    window.api.board.get(project.path).then((d) => {
      if (!alive) return
      setColumns(d.columns)
      setCards(d.cards)
    })
    return () => {
      alive = false
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

  const sorted = [...columns].sort((a, b) => a.position - b.position)

  return (
    <div className="board">
      {sorted.map((col) => (
        <BoardColumnView
          key={col.id}
          col={col}
          cards={cardsIn(col.id)}
          dragId={dragId}
          onAddCard={(t) => addCard(col.id, t)}
          onRename={(t) => renameColumn(col, t)}
          onDelete={() => deleteColumn(col.id)}
          onCardClick={(c) => setEditing(c)}
          onDropToColumn={() => dragId.current && moveCard(dragId.current, col.id)}
          onDropBeforeCard={(cardId) => dragId.current && moveCard(dragId.current, col.id, cardId)}
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
        />
      )}
    </div>
  )
}

function BoardColumnView(props: {
  col: BoardColumn
  cards: BoardCard[]
  dragId: MutableRefObject<string | null>
  onAddCard: (t: string) => void
  onRename: (t: string) => void
  onDelete: () => void
  onCardClick: (c: BoardCard) => void
  onDropToColumn: () => void
  onDropBeforeCard: (cardId: string) => void
}) {
  const { col, cards } = props
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(col.title)

  return (
    <div
      className="board-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        props.onDropToColumn()
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
        {cards.map((c) => (
          <BoardCardView
            key={c.id}
            card={c}
            dragId={props.dragId}
            onClick={() => props.onCardClick(c)}
            onDropBefore={() => props.onDropBeforeCard(c.id)}
          />
        ))}
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
  dragId: MutableRefObject<string | null>
  onClick: () => void
  onDropBefore: () => void
}) {
  const { card } = props
  const tm = typeMeta(card.type)
  return (
    <div
      className="board-card"
      draggable
      onDragStart={() => {
        props.dragId.current = card.id
      }}
      onDragEnd={() => {
        props.dragId.current = null
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        props.onDropBefore()
      }}
      onClick={props.onClick}
    >
      <span className={`ctag ${tm.cls}`}>
        {tm.emoji} {tm.label}
      </span>
      <div className="board-card-title">{card.title}</div>
      {card.body ? <div className="board-card-body">📝 note</div> : null}
    </div>
  )
}

function CardEditor(props: {
  card: BoardCard
  onClose: () => void
  onSave: (c: BoardCard) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(props.card.title)
  const [body, setBody] = useState(props.card.body)
  const [type, setType] = useState<CardType>(props.card.type)

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
          <button
            onClick={() =>
              props.onSave({ ...props.card, title: title.trim() || props.card.title, body, type })
            }
          >
            Save
          </button>
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
