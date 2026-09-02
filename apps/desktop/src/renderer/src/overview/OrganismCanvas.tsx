// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// The organism's body: a canvas that fills the home hero behind the greeting. This component
// owns the plumbing only — sizing (DPR-aware), the frame loop (60fps when something moves,
// ~20fps while the core just breathes, paused while a project is open), theme palette,
// reduced-motion (a single settled frame), and wiring store agents + hook reflexes into the
// simulation in `organism.ts`.

import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { Organism, readPalette, type AgentSnapshot } from './organism'
import { senses } from './senses'

/** Night mode: between 23:00 and 05:00 the organism keeps the lights low. */
function nightDim(): number {
  const h = new Date().getHours()
  return h < 5 || h >= 23 ? 0.7 : 1
}

export function OrganismCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  const orgRef = useRef<Organism | null>(null)
  if (!orgRef.current) orgRef.current = new Organism()
  const org = orgRef.current

  const visible = useStore((s) => s.selectedProjectId === null)
  const theme = useStore((s) => s.theme)
  const terminals = useStore((s) => s.terminals)

  const sizeRef = useRef({ w: 0, h: 0 })
  const staticRef = useRef(false)
  const redrawRef = useRef<() => void>(() => {})

  // Live agents → nuclei. `terminals` changes on every status/lastLine patch; setAgents diffs.
  useEffect(() => {
    const list: AgentSnapshot[] = []
    for (const id in terminals) {
      const t = terminals[id]!
      if (t.kind === 'agent' && !t.exited) list.push({ id: t.id, status: t.status })
    }
    org.setAgents(list)
    if (staticRef.current) redrawRef.current()
  }, [terminals, org])

  // Theme tokens → palette (grayscale themes hand us grays, so the organism stays on-theme).
  useEffect(() => {
    org.setPalette(readPalette())
    if (staticRef.current) redrawRef.current()
  }, [theme, org])

  // Size with the hero, at device resolution.
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect()
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      if (!w || !h) return
      const dpr = window.devicePixelRatio || 1
      sizeRef.current = { w, h }
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (staticRef.current) redrawRef.current()
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Reflexes from the hook feed, and the pointer passing over the hero.
  useEffect(() => {
    const off = senses.onReflex((r, id) => org.reflex(r, id))
    const canvas = ref.current
    const host = canvas?.parentElement
    const onMove = (e: PointerEvent): void => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      org.poke(e.clientX - rect.left, e.clientY - rect.top)
    }
    host?.addEventListener('pointermove', onMove)
    return () => {
      off()
      host?.removeEventListener('pointermove', onMove)
    }
  }, [org])

  // Frame loop — only while the home layer is actually on screen.
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !visible) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let last = performance.now()
    let lastDraw = 0

    const drawStatic = (): void => {
      const { w, h } = sizeRef.current
      if (!w || !h) return
      org.settle(w, h)
      org.draw(ctx, w, h, nightDim())
    }
    redrawRef.current = drawStatic

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      const { w, h } = sizeRef.current
      if (!w || !h) return
      // asleep: ~20fps is plenty for a breathing core
      if (org.isCalm() && now - lastDraw < 50) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      lastDraw = now
      org.step(dt, w, h)
      org.draw(ctx, w, h, nightDim())
    }

    const start = (): void => {
      staticRef.current = mq.matches
      if (mq.matches) {
        cancelAnimationFrame(raf)
        raf = 0
        drawStatic()
      } else if (!raf) {
        last = performance.now()
        raf = requestAnimationFrame(loop)
      }
    }
    start()
    mq.addEventListener('change', start)
    return () => {
      mq.removeEventListener('change', start)
      cancelAnimationFrame(raf)
      redrawRef.current = () => {}
    }
  }, [visible, org])

  return <canvas ref={ref} className="hero-organism" aria-hidden="true" />
}
