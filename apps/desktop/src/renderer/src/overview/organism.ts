// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// The organism — CmdrZone's ambient "being" that lives behind the home hero. Pure simulation
// + canvas drawing, no React: the component feeds it agent snapshots and reflexes and calls
// step()/draw() from its frame loop.
//
// Anatomy: every live agent is a *nucleus* (a glowing core with a ring of orbiters). Working
// nuclei burn bright and spin; a waiting one goes amber, stops, and opens an eye that looks
// toward you; errors jitter red; idle ones dim to embers. Nuclei near each other grow faint
// filaments. Loose *dust* drifts through the field and is pulled in when things are busy.
// With no agents at all, everything folds into a single sleeping core that breathes and
// pulses a slow heartbeat. Hook reflexes are its twitches: read = inhale (motes fly in),
// write = exhale (motes fly out), run = spark, spawn = a bud splits off, prompt = a ripple
// ("heard you"), stop = a calm settling ring, wake = a bloom.

import type { AgentStatus } from '../state/store'
import type { Reflex } from './senses'

export type RGB = readonly [number, number, number]

export interface Palette {
  holo1: RGB
  holo2: RGB
  amber: RGB
  red: RGB
  green: RGB
  muted: RGB
  text: RGB
  /** light ground — additive "lighter" blending would wash out to white, so paint normally */
  light?: boolean
}

export interface AgentSnapshot {
  id: string
  status: AgentStatus
}

interface Orbiter {
  a: number
  r: number
  speed: number
  size: number
  wobble: number
  ecc: number
}

interface Nucleus {
  id: string
  status: AgentStatus
  sleeping: boolean
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  life: number
  fade: number
  dying: boolean
  energy: number
  spin: number
  hue: number
  seed: number
  color: [number, number, number]
  orbiters: Orbiter[]
  /** brief brightness bump (heartbeat, reflexes) — decays */
  pulse: number
  /** eye: openness 0..1 and gaze direction (unit-ish vector) */
  eye: number
  gazeX: number
  gazeY: number
  blinkAt: number
}

interface Dust {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
  phase: number
}

interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  ttl: number
  size: number
  color: RGB
  mode: 'in' | 'out' | 'spark' | 'bud'
  /** target nucleus id for 'in' motes and buds */
  host?: string
  /** bud orbit state */
  a?: number
  r?: number
}

interface Ring {
  x: number
  y: number
  r: number
  vr: number
  age: number
  ttl: number
  alpha: number
  width: number
  color: RGB
  host?: string
}

const TAU = Math.PI * 2
const REST_ID = '__rest'
const HEARTBEAT_S = 8.5
const BREATH_S = 5.5

const ENERGY: Record<AgentStatus, number> = { idle: 0.22, working: 1, waiting: 0.2, done: 0.36, error: 0.62 }
const SPIN: Record<AgentStatus, number> = { idle: 0.28, working: 1, waiting: 0, done: 0.32, error: 1.5 }

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
/** frame-rate independent exponential approach */
const approach = (cur: number, target: number, rate: number, dt: number): number =>
  lerp(cur, target, 1 - Math.exp(-rate * dt))
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const rgba = (c: RGB, a: number): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1).toFixed(3)})`

/** Tiny deterministic PRNG so the field looks the same across re-mounts. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

export class Organism {
  private nuclei: Nucleus[] = []
  private dust: Dust[] = []
  private motes: Mote[] = []
  private rings: Ring[] = []
  private t = 0
  private w = 0
  private h = 0
  private heartbeat = 0
  private hueSeq = 0
  private pointer: { x: number; y: number; until: number } | null = null
  private wantAgents: AgentSnapshot[] = []
  private rand = mulberry32(0x5eed)
  /** field-wide activity 0..1 (smoothed max of the nuclei) */
  energy = 0

  // ── Inputs ────────────────────────────────────────────────────────────────────────────

  /** Replace the set of live agents. Cheap to call often — diffs by id. */
  setAgents(list: AgentSnapshot[]): void {
    this.wantAgents = list
    const want = new Map(list.map((a) => [a.id, a.status]))
    for (const n of this.nuclei) {
      if (n.sleeping) {
        if (list.length > 0 && !n.dying) n.dying = true
        continue
      }
      const st = want.get(n.id)
      if (st === undefined) n.dying = true
      else {
        if (n.dying) {
          n.dying = false
          n.fade = 1
        }
        if (n.status !== st) {
          if (st === 'waiting') n.blinkAt = this.t + 1.2
          n.status = st
        }
      }
    }
    const have = new Set(this.nuclei.filter((n) => !n.sleeping).map((n) => n.id))
    for (const a of list) if (!have.has(a.id)) this.nuclei.push(this.spawnNucleus(a.id, a.status, false))
    if (list.length === 0 && !this.nuclei.some((n) => n.sleeping && !n.dying)) {
      this.nuclei.push(this.spawnNucleus(REST_ID, 'idle', true))
    }
  }

  /** A twitch from the hook feed. `id` is the terminal (nucleus) it belongs to. */
  reflex(kind: Reflex, id?: string): void {
    const n = (id && this.nuclei.find((x) => x.id === id && !x.dying)) || this.anchor()
    if (!n) return
    const c = n.color as RGB
    switch (kind) {
      case 'read':
        this.inhale(n, 8, c)
        break
      case 'reach':
        this.inhale(n, 5, c)
        this.ring(n, 0.14, 1, 18, 40)
        break
      case 'write':
        this.exhale(n, 9, c)
        break
      case 'run':
        this.spark(n, 5)
        n.pulse = Math.max(n.pulse, 0.9)
        break
      case 'spawn':
        this.bud(n)
        break
      case 'prompt':
        this.ring(n, 0.3, 1.2, 60, 8)
        n.pulse = Math.max(n.pulse, 0.6)
        break
      case 'stop':
        this.ring(n, 0.2, 1, 34, 22)
        this.exhale(n, 4, c)
        break
      case 'wake':
        this.ring(n, 0.35, 1.4, 48, 4)
        this.exhale(n, 14, c)
        n.pulse = 1
        break
    }
  }

  /** The pointer moved over the hero — the field notices for a moment. */
  poke(x: number, y: number): void {
    this.pointer = { x, y, until: this.t + 1.6 }
    const rest = this.nuclei.find((n) => n.sleeping && !n.dying)
    if (rest) rest.pulse = Math.max(rest.pulse, 0.35)
  }

  /** True when nothing moves but the sleeping core — the loop can drop its frame rate. */
  isCalm(): boolean {
    return (
      this.motes.length === 0 &&
      this.rings.length === 0 &&
      !this.nuclei.some((n) => !n.sleeping || n.dying || n.pulse > 0.02) &&
      (this.pointer === null || this.pointer.until < this.t)
    )
  }

  /** Snap everything to its resting layout — for reduced-motion single-frame renders. */
  settle(w: number, h: number): void {
    this.w = w
    this.h = h
    this.layout()
    for (const n of this.nuclei) {
      n.x = n.tx
      n.y = n.ty
      n.life = 1
      n.energy = ENERGY[n.status]
      n.color = [...this.statusColor(n)] as [number, number, number]
      n.eye = n.status === 'waiting' ? 1 : 0
    }
    this.energy = Math.max(0, ...this.nuclei.map((n) => n.energy))
    this.motes.length = 0
    this.rings.length = 0
    this.ensureDust()
  }

  private pal: Palette = {
    holo1: [90, 209, 255],
    holo2: [168, 139, 250],
    amber: [229, 192, 123],
    red: [255, 107, 107],
    green: [87, 217, 163],
    muted: [124, 133, 151],
    text: [215, 220, 229]
  }

  setPalette(p: Palette): void {
    this.pal = p
  }

  // ── Simulation ────────────────────────────────────────────────────────────────────────

  step(dt: number, w: number, h: number): void {
    if (w !== this.w || h !== this.h) {
      this.w = w
      this.h = h
      this.ensureDust()
    }
    this.t += dt
    this.layout()
    const s = this.scale()

    let peak = 0
    for (const n of this.nuclei) {
      // life-cycle
      n.life = Math.min(1, n.life + dt / 0.9)
      if (n.dying) n.fade = Math.max(0, n.fade - dt / 0.7)
      // mood
      const target = n.sleeping ? 0.5 : ENERGY[n.status]
      n.energy = approach(n.energy, target, target > n.energy ? 2.2 : 0.9, dt)
      n.spin = approach(n.spin, n.sleeping ? 0.2 : SPIN[n.status], 1.6, dt)
      const c = this.statusColor(n)
      n.color[0] = approach(n.color[0], c[0], 3, dt)
      n.color[1] = approach(n.color[1], c[1], 3, dt)
      n.color[2] = approach(n.color[2], c[2], 3, dt)
      n.pulse = Math.max(0, n.pulse - dt * 1.4)
      // motion: spring to layout target + slow wander
      const wob = n.sleeping ? 2.2 : 4.5
      const wx = Math.sin(this.t * 0.31 + n.seed) * wob + Math.sin(this.t * 0.73 + n.seed * 1.7) * wob * 0.4
      const wy = Math.cos(this.t * 0.27 + n.seed * 0.6) * wob * 0.5
      n.vx += (n.tx + wx - n.x) * 3.2 * dt
      n.vy += (n.ty + wy - n.y) * 3.2 * dt
      // keep nuclei apart
      for (const m of this.nuclei) {
        if (m === n || m.dying) continue
        const dx = n.x - m.x
        const dy = n.y - m.y
        const d = Math.hypot(dx, dy) || 0.01
        const min = 40 * s
        if (d < min) {
          const f = ((min - d) / min) * 60 * dt
          n.vx += (dx / d) * f
          n.vy += (dy / d) * f
        }
      }
      n.vx *= Math.exp(-3.5 * dt)
      n.vy *= Math.exp(-3.5 * dt)
      n.x += n.vx * dt
      n.y += n.vy * dt
      if (n.status === 'error' && !n.sleeping) {
        n.x += (this.rand() - 0.5) * 2.4 * n.fade
        n.y += (this.rand() - 0.5) * 2.4 * n.fade
      }
      // orbiters
      const erratic = n.status === 'error' ? 1 + 0.9 * Math.sin(this.t * 9 + n.seed) : 1
      for (const o of n.orbiters) o.a += o.speed * n.spin * erratic * dt * (1 + 0.12 * Math.sin(this.t * 0.9 + o.wobble))
      // eye
      const wantEye = n.status === 'waiting' && !n.sleeping ? 1 : n.sleeping && this.pointerActive() ? 0.55 : 0
      let eye = wantEye
      if (wantEye > 0 && this.t > n.blinkAt) {
        // a blink: closed for ~120ms, then schedule the next one
        if (this.t < n.blinkAt + 0.12) eye = 0
        else n.blinkAt = this.t + 2.4 + this.rand() * 3.2
      }
      n.eye = approach(n.eye, eye, 14, dt)
      if (this.pointer && this.pointerActive()) {
        const gx = this.pointer.x - n.x
        const gy = this.pointer.y - n.y
        const d = Math.hypot(gx, gy) || 1
        n.gazeX = approach(n.gazeX, gx / d, 6, dt)
        n.gazeY = approach(n.gazeY, gy / d, 6, dt)
      } else {
        // waiting agents look left, toward the greeting — toward you
        n.gazeX = approach(n.gazeX, -0.85, 3, dt)
        n.gazeY = approach(n.gazeY, 0.15, 3, dt)
      }
      if (!n.dying || n.fade > 0) peak = Math.max(peak, n.energy * n.fade * (n.sleeping ? 0.3 : 1))
    }
    this.nuclei = this.nuclei.filter((n) => !(n.dying && n.fade <= 0))
    this.energy = approach(this.energy, clamp(peak, 0, 1), 1.5, dt)

    // heartbeat while asleep
    const rest = this.nuclei.find((n) => n.sleeping && !n.dying)
    if (rest) {
      this.heartbeat += dt
      if (this.heartbeat >= HEARTBEAT_S) {
        this.heartbeat = 0
        rest.pulse = Math.max(rest.pulse, 0.7)
        this.ring(rest, 0.22, 0.9, 36, 3)
      }
    } else this.heartbeat = HEARTBEAT_S * 0.6

    this.stepDust(dt, s)
    this.stepMotes(dt, s)
    for (const r of this.rings) {
      r.age += dt
      r.r += r.vr * dt
      r.vr *= Math.exp(-1.6 * dt)
      if (r.host) {
        const hn = this.nuclei.find((n) => n.id === r.host)
        if (hn) {
          r.x = hn.x
          r.y = hn.y
        }
      }
    }
    this.rings = this.rings.filter((r) => r.age < r.ttl)
  }

  private pointerActive(): boolean {
    return this.pointer !== null && this.pointer.until > this.t
  }

  private scale(): number {
    return clamp(this.h / 150, 0.75, 1.3)
  }

  /** Where the organism lives: right of the greeting, left of the clock, above the stats. */
  private home(): { x: number; y: number } {
    return { x: this.w * 0.6, y: this.h * 0.44 }
  }

  private layout(): void {
    const live = this.nuclei.filter((n) => !n.dying)
    const { x: cx, y: cy } = this.home()
    const s = this.scale()
    const n = live.length
    const gap = Math.min(78 * s, (this.w * 0.36) / Math.max(1, n))
    const ry = Math.min(this.h * 0.16, 9 + 3 * n) * s
    live.forEach((nu, i) => {
      nu.tx = cx + (i - (n - 1) / 2) * gap
      nu.ty = cy + (n > 1 ? (i % 2 ? 1 : -1) * ry * 0.6 : 0)
    })
    // dying ones just drift where they are, slightly downward
    for (const nu of this.nuclei) if (nu.dying) nu.ty = nu.y + 6
  }

  private anchor(): Nucleus | undefined {
    return this.nuclei.find((n) => !n.dying) ?? this.nuclei[0]
  }

  private statusColor(n: Nucleus): RGB {
    const p = this.pal
    if (n.sleeping) return mix(p.muted, p.holo1, 0.35)
    switch (n.status) {
      case 'working':
        return mix(p.holo1, p.holo2, n.hue)
      case 'waiting':
        return p.amber
      case 'error':
        return p.red
      case 'done':
        return p.green
      default:
        return mix(p.muted, p.holo1, 0.2)
    }
  }

  private spawnNucleus(id: string, status: AgentStatus, sleeping: boolean): Nucleus {
    const r = mulberry32(hashId(id))
    const { x, y } = this.home()
    const count = sleeping ? 9 : 12
    const orbiters: Orbiter[] = []
    for (let i = 0; i < count; i++) {
      orbiters.push({
        a: r() * TAU,
        r: 10 + r() * 15,
        speed: (0.45 + r() * 0.7) * (r() < 0.15 ? -1 : 1),
        size: 0.7 + r() * 1.1,
        wobble: r() * TAU,
        ecc: 0.55 + r() * 0.45
      })
    }
    const hue = sleeping ? 0 : (this.hueSeq++ * 0.37) % 1
    const n: Nucleus = {
      id,
      status,
      sleeping,
      x: x + (r() - 0.5) * 30,
      y: y + (r() - 0.5) * 10,
      vx: 0,
      vy: 0,
      tx: x,
      ty: y,
      life: 0,
      fade: 1,
      dying: false,
      energy: 0,
      spin: 0,
      hue,
      seed: r() * 100,
      color: [0, 0, 0],
      orbiters,
      pulse: sleeping ? 0 : 0.8,
      eye: 0,
      gazeX: -0.85,
      gazeY: 0.15,
      blinkAt: 0
    }
    const c = this.statusColor(n)
    n.color = [c[0], c[1], c[2]]
    if (!sleeping) this.ring(n, 0.25, 1.2, 40, 4)
    return n
  }

  // ── Dust ──────────────────────────────────────────────────────────────────────────────

  private ensureDust(): void {
    const want = this.w > 0 ? clamp(Math.round(this.w / 24), 18, 64) : 0
    while (this.dust.length < want) {
      this.dust.push({
        x: this.rand() * this.w,
        y: this.rand() * this.h,
        vx: (this.rand() - 0.5) * 6,
        vy: (this.rand() - 0.5) * 4,
        size: 0.7 + this.rand() * 1.0,
        alpha: 0.16 + this.rand() * 0.3,
        phase: this.rand() * TAU
      })
    }
    if (this.dust.length > want) this.dust.length = want
    for (const d of this.dust) {
      d.x = clamp(d.x, 0, this.w)
      d.y = clamp(d.y, 0, this.h)
    }
  }

  private stepDust(dt: number, s: number): void {
    const live = this.nuclei.filter((n) => !n.dying)
    const pull = this.energy
    const p = this.pointerActive() ? this.pointer : null
    for (const d of this.dust) {
      // gentle brownian drift
      d.vx += (Math.sin(this.t * 0.4 + d.phase) * 0.6 + (this.rand() - 0.5) * 1.5) * dt * 6
      d.vy += (Math.cos(this.t * 0.33 + d.phase * 1.3) * 0.4 + (this.rand() - 0.5) * 1.5) * dt * 6
      // drawn toward the busiest nearby nucleus, but not into it
      let best: Nucleus | null = null
      let bd = Infinity
      for (const n of live) {
        const dd = Math.hypot(n.x - d.x, n.y - d.y) / (0.4 + n.energy)
        if (dd < bd) {
          bd = dd
          best = n
        }
      }
      if (best) {
        const dx = best.x - d.x
        const dy = best.y - d.y
        const dist = Math.hypot(dx, dy) || 1
        const inner = 30 * s
        const f = dist < inner ? -(inner - dist) * 1.2 : 26 * pull * best.energy
        d.vx += (dx / dist) * f * dt
        d.vy += (dy / dist) * f * dt
      }
      if (p) {
        const dx = p.x - d.x
        const dy = p.y - d.y
        const dist = Math.hypot(dx, dy) || 1
        if (dist < 140) {
          const f = 40 * (1 - dist / 140)
          d.vx += (dx / dist) * f * dt
          d.vy += (dy / dist) * f * dt
        }
      }
      const damp = Math.exp(-(0.9 + 1.4 * pull) * dt)
      d.vx *= damp
      d.vy *= damp
      d.x += d.vx * dt
      d.y += d.vy * dt
      if (d.x < -4) d.x = this.w + 4
      else if (d.x > this.w + 4) d.x = -4
      if (d.y < -4) d.y = this.h + 4
      else if (d.y > this.h + 4) d.y = -4
    }
  }

  // ── Motes & rings (reflexes) ──────────────────────────────────────────────────────────

  private inhale(n: Nucleus, count: number, color: RGB): void {
    const s = this.scale()
    for (let i = 0; i < count; i++) {
      const a = this.rand() * TAU
      const r = (34 + this.rand() * 30) * s
      const x = n.x + Math.cos(a) * r
      const y = n.y + Math.sin(a) * r * 0.75
      const speed = 55 + this.rand() * 35
      this.motes.push({
        x,
        y,
        vx: ((n.x - x) / r) * speed,
        vy: ((n.y - y) / r) * speed,
        age: 0,
        ttl: 0.7 + this.rand() * 0.35,
        size: 0.8 + this.rand() * 1,
        color,
        mode: 'in',
        host: n.id
      })
    }
    n.pulse = Math.max(n.pulse, 0.35)
  }

  private exhale(n: Nucleus, count: number, color: RGB): void {
    const s = this.scale()
    for (let i = 0; i < count; i++) {
      const a = this.rand() * TAU
      const speed = (38 + this.rand() * 40) * s
      this.motes.push({
        x: n.x,
        y: n.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.7,
        age: 0,
        ttl: 0.9 + this.rand() * 0.5,
        size: 0.9 + this.rand() * 1.1,
        color,
        mode: 'out'
      })
    }
    n.pulse = Math.max(n.pulse, 0.45)
  }

  private spark(n: Nucleus, count: number): void {
    const s = this.scale()
    for (let i = 0; i < count; i++) {
      const a = this.rand() * TAU
      const speed = (90 + this.rand() * 80) * s
      this.motes.push({
        x: n.x,
        y: n.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        age: 0,
        ttl: 0.28 + this.rand() * 0.2,
        size: 1 + this.rand() * 0.8,
        color: this.pal.text,
        mode: 'spark'
      })
    }
  }

  private bud(n: Nucleus): void {
    const s = this.scale()
    this.motes.push({
      x: n.x,
      y: n.y,
      vx: 0,
      vy: 0,
      age: 0,
      ttl: 2.6,
      size: 2.2 * s,
      color: n.color as RGB,
      mode: 'bud',
      host: n.id,
      a: this.rand() * TAU,
      r: 4
    })
    n.pulse = Math.max(n.pulse, 0.5)
  }

  private ring(n: Nucleus, alpha: number, width: number, speed: number, startR: number): void {
    const s = this.scale()
    this.rings.push({
      x: n.x,
      y: n.y,
      r: startR * s,
      vr: speed * s,
      age: 0,
      ttl: 1.6,
      alpha,
      width,
      color: n.color as RGB,
      host: n.id
    })
  }

  private stepMotes(dt: number, s: number): void {
    for (const m of this.motes) {
      m.age += dt
      if (m.mode === 'in' && m.host) {
        const hn = this.nuclei.find((n) => n.id === m.host)
        if (hn) {
          const dx = hn.x - m.x
          const dy = hn.y - m.y
          const d = Math.hypot(dx, dy) || 1
          m.vx += (dx / d) * 260 * dt
          m.vy += (dy / d) * 260 * dt
          if (d < 4 * s) m.age = m.ttl
        }
      } else if (m.mode === 'bud' && m.host) {
        const hn = this.nuclei.find((n) => n.id === m.host)
        if (!hn) {
          m.age = m.ttl
          continue
        }
        m.a = (m.a ?? 0) + 2.4 * dt
        m.r = Math.min(30 * s, (m.r ?? 4) + 18 * dt)
        m.x = hn.x + Math.cos(m.a) * m.r
        m.y = hn.y + Math.sin(m.a) * m.r * 0.65
        continue
      } else if (m.mode === 'out') {
        m.vx *= Math.exp(-1.8 * dt)
        m.vy *= Math.exp(-1.8 * dt)
      }
      m.x += m.vx * dt
      m.y += m.vy * dt
    }
    this.motes = this.motes.filter((m) => m.age < m.ttl)
  }

  // ── Drawing ───────────────────────────────────────────────────────────────────────────

  /** `dim` is a global brightness multiplier (night mode). */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dim = 1): void {
    ctx.clearRect(0, 0, w, h)
    const blend: GlobalCompositeOperation = this.pal.light ? 'source-over' : 'lighter'
    ctx.globalCompositeOperation = blend
    const s = this.scale()
    const pal = this.pal

    // filaments between neighbours
    const live = this.nuclei.filter((n) => !n.dying && !n.sleeping)
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!
        const b = live[j]!
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const reach = 210 * s
        if (d > reach) continue
        const e = Math.min(a.energy, b.energy) * a.life * b.life
        const alpha = 0.16 * e * (1 - d / reach) * dim
        if (alpha < 0.004) continue
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const nx = -(b.y - a.y) / d
        const ny = (b.x - a.x) / d
        const bow = Math.sin(this.t * 0.8 + a.seed + b.seed) * 10 * s
        ctx.strokeStyle = rgba(mix(a.color as RGB, b.color as RGB, 0.5), alpha)
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.quadraticCurveTo(mx + nx * bow, my + ny * bow, b.x, b.y)
        ctx.stroke()
      }
    }

    // dust
    const dustTint = mix(pal.muted, pal.holo1, 0.4 * this.energy)
    for (const d of this.dust) {
      const tw = 0.7 + 0.3 * Math.sin(this.t * 1.3 + d.phase)
      ctx.fillStyle = rgba(dustTint, d.alpha * tw * (0.7 + 0.3 * this.energy) * dim)
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.size * s, 0, TAU)
      ctx.fill()
    }

    // rings
    for (const r of this.rings) {
      const k = 1 - r.age / r.ttl
      ctx.strokeStyle = rgba(r.color, r.alpha * k * k * dim)
      ctx.lineWidth = r.width
      ctx.beginPath()
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.72, 0, 0, TAU)
      ctx.stroke()
    }

    // nuclei
    for (const n of this.nuclei) {
      const c = n.color as RGB
      const a = n.life * n.fade * dim
      const e = n.energy
      const breath = n.sleeping ? 1 + 0.13 * Math.sin((this.t * TAU) / BREATH_S) : 1 + 0.035 * Math.sin(this.t * 2.1 + n.seed)
      const glow = (0.35 + 0.65 * e + n.pulse * 0.8 + (n.sleeping ? 0.3 : 0)) * breath
      // halo
      const hr = ((n.sleeping ? 26 : 18) + 32 * e + 10 * n.pulse) * s * breath
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, hr)
      g.addColorStop(0, rgba(c, 0.34 * glow * a))
      g.addColorStop(0.4, rgba(c, 0.11 * glow * a))
      g.addColorStop(1, rgba(c, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(n.x, n.y, hr, 0, TAU)
      ctx.fill()
      // orbiters
      const orbitScale = (0.82 + 0.38 * e) * s * n.life
      for (const o of n.orbiters) {
        const ox = n.x + Math.cos(o.a) * o.r * orbitScale
        const oy = n.y + Math.sin(o.a) * o.r * orbitScale * o.ecc
        const depth = 0.55 + 0.45 * Math.sin(o.a) // pseudo-3D: front brighter
        const oa = (0.22 + 0.55 * e + (n.sleeping ? 0.15 : 0)) * depth * a
        const tail = o.speed * n.spin * 0.16 // radians of trail behind the orbiter
        if (Math.abs(tail) > 0.01) {
          const ta = o.a - tail
          ctx.strokeStyle = rgba(c, oa * 0.45)
          ctx.lineWidth = o.size * s * 0.9
          ctx.beginPath()
          ctx.moveTo(n.x + Math.cos(ta) * o.r * orbitScale, n.y + Math.sin(ta) * o.r * orbitScale * o.ecc)
          ctx.lineTo(ox, oy)
          ctx.stroke()
        }
        ctx.fillStyle = rgba(mix(c, pal.text, 0.25), oa)
        ctx.beginPath()
        ctx.arc(ox, oy, o.size * s * (0.8 + 0.4 * depth), 0, TAU)
        ctx.fill()
      }
      // core
      const cr = (2.3 + 1.9 * e + 1.2 * n.pulse + (n.sleeping ? 1.4 : 0)) * s * breath
      ctx.fillStyle = rgba(mix(c, pal.text, 0.35), 0.85 * a)
      ctx.beginPath()
      ctx.arc(n.x, n.y, cr, 0, TAU)
      ctx.fill()
      ctx.fillStyle = rgba(pal.text, (0.55 + 0.4 * e) * a)
      ctx.beginPath()
      ctx.arc(n.x, n.y, cr * 0.45, 0, TAU)
      ctx.fill()
      // eye — a dark pupil looking somewhere, only when it's open
      if (n.eye > 0.05) {
        ctx.globalCompositeOperation = 'source-over'
        const pr = cr * 0.5 * n.eye
        ctx.fillStyle = rgba([12, 14, 20], 0.85 * a * n.eye)
        ctx.beginPath()
        ctx.arc(n.x + n.gazeX * cr * 0.45, n.y + n.gazeY * cr * 0.45, pr, 0, TAU)
        ctx.fill()
        ctx.globalCompositeOperation = blend
      }
    }

    // motes
    for (const m of this.motes) {
      const k = m.age / m.ttl
      let alpha: number
      let size = m.size * s
      switch (m.mode) {
        case 'in':
          alpha = 0.25 + 0.6 * k
          size *= 1.2 - 0.5 * k
          break
        case 'spark':
          alpha = 0.95 * (1 - k)
          break
        case 'bud':
          alpha = 0.9 * Math.sin(Math.PI * k)
          size *= 0.6 + 0.4 * k
          break
        default:
          alpha = 0.8 * (1 - k) * (1 - k)
          size *= 1 - 0.4 * k
      }
      ctx.fillStyle = rgba(mix(m.color, pal.text, m.mode === 'spark' ? 0.6 : 0.2), alpha * dim)
      ctx.beginPath()
      ctx.arc(m.x, m.y, size, 0, TAU)
      ctx.fill()
    }

    ctx.globalCompositeOperation = 'source-over'
  }
}

// ── Palette helpers ─────────────────────────────────────────────────────────────────────

function parseColor(v: string, fallback: RGB): RGB {
  const s = v.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)
  if (hex) {
    const h = hex[1]!
    if (h.length === 3) return [parseInt(h[0]! + h[0], 16), parseInt(h[1]! + h[1], 16), parseInt(h[2]! + h[2], 16)]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return fallback
}

// perceived lightness, 0..1 — enough to tell a light ground from a dark one
const lum = ([r, g, b]: RGB): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/** Read the active theme's tokens off <html> so the organism re-skins with the app. */
export function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement)
  const get = (name: string, fb: RGB): RGB => parseColor(cs.getPropertyValue(name), fb)
  return {
    holo1: get('--holo-1', [90, 209, 255]),
    holo2: get('--holo-2', [168, 139, 250]),
    amber: get('--amber', [229, 192, 123]),
    red: get('--red', [255, 107, 107]),
    green: get('--green', [87, 217, 163]),
    muted: get('--muted', [124, 133, 151]),
    text: get('--text', [215, 220, 229]),
    light: lum(get('--bg', [11, 13, 18])) > 0.5
  }
}
