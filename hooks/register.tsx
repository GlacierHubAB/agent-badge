import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage } from 'claude-code'

import type { Badge, Meta, Palette, Usage } from '../types'

const badge = atom({ plugin: 'agent-badge', key: 'badge' } as const, {
  role: 'new agent',
  task: 'waiting for a first task',
  history: [],
} as Badge)
const meta = atom({ plugin: 'agent-badge', key: 'meta' } as const, {
  model: '',
  folder: '',
  seed: 0,
} as Meta)
const palette = atom({ plugin: 'agent-badge', key: 'palette' } as const, {
  colors: ['#66cb8e', '#e8b84a', '#ea9e9e'],
  dark: '#000000',
  warn: '#e8b84a',
  alert: '#ea9e9e',
  track: '#2e2e2e',
  blush: '#ea9e9e',
} as Palette)
const usage = atom({ plugin: 'agent-badge', key: 'usage' } as const, {} as Usage)

const THEME_COLORS = '.local/state/omarchy/current/theme/colors.toml'
const PALETTE_KEYS = [
  'red', 'yellow', 'orange', 'green', 'cyan', 'blue', 'magenta',
  'bright_red', 'bright_yellow', 'bright_green', 'bright_cyan', 'bright_blue', 'bright_magenta',
  'accent',
]
const HISTORY_LIMIT = 3

// Layout, in terminal cells. Cells are about twice as tall as wide, so a
// square picture is twice as many columns as rows.
const AVATAR_COLUMNS = 8
const AVATAR_ROWS = 4
const RING_COLUMNS = 6
const RING_ROWS = 3
const GAUGE_TEXT = 14
const GAUGE_WIDTH = RING_COLUMNS + 1 + GAUGE_TEXT + 2
const SPENT_WIDTH = 12
const BAR_CELLS = 10
const COMPACT_WIDTH = 34
const INFO_MIN = 40

// Animation.
const TICK_MS = 160
const SPRITE = 16
const SPRITE_SCALE = 6
const RING_PX = 60

const ADJECTIVES = [
  'Mossy', 'Fizzy', 'Sleepy', 'Brave', 'Tiny', 'Cosmic', 'Fuzzy', 'Zippy', 'Wobbly', 'Sunny',
  'Misty', 'Plucky', 'Snug', 'Bouncy', 'Quiet', 'Spicy', 'Velvet', 'Pebble', 'Comet', 'Maple',
]
const CRITTERS = [
  'Otter', 'Moth', 'Newt', 'Fox', 'Owl', 'Axolotl', 'Panda', 'Gecko', 'Quokka', 'Hedgehog',
  'Puffin', 'Wombat', 'Ferret', 'Koala', 'Lemur', 'Capybara', 'Badger', 'Narwhal', 'Sprite', 'Tanuki',
]

// ── small helpers ─────────────────────────────────────────────────────────

function hash(text: string): number {
  let acc = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    acc ^= text.charCodeAt(i)
    acc = Math.imul(acc, 0x01000193)
  }
  return acc >>> 0
}

function rng(seed: number): () => number {
  let a = seed || 1
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length] as T
}

function critterName(seed: number): string {
  const rand = rng(seed ^ 0x9e3779b9)
  return `${pick(ADJECTIVES, Math.floor(rand() * ADJECTIVES.length))} ${pick(CRITTERS, Math.floor(rand() * CRITTERS.length))}`
}

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function bodyColor(seed: number, colors: string[]): string {
  return pick(colors, seed)
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  const out: string[] = []
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out.push(
      BASE64.charAt((n >> 18) & 63) + BASE64.charAt((n >> 12) & 63) +
      (i + 1 < bytes.length ? BASE64.charAt((n >> 6) & 63) : '=') +
      (i + 2 < bytes.length ? BASE64.charAt(n & 63) : '='),
    )
  }
  return out.join('')
}

function shortCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function untilText(iso: string | undefined, now: number | undefined): string {
  if (!iso || now === undefined) return ''
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const minutes = Math.max(0, Math.round((at - now) / 60000))
  if (minutes < 1) return 'resets now'
  if (minutes < 60) return `resets in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `resets in ${hours}h ${minutes % 60}m`
  return `resets in ${Math.floor(hours / 24)}d ${hours % 24}h`
}

function prettyModel(model: string): string {
  const m = model.match(/claude-([a-z]+)-(\d+)(?:-(\d+))?/i)
  if (!m || !m[1] || !m[2]) return model
  const name = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  const version = m[3] && m[3].length <= 2 ? `${m[2]}.${m[3]}` : m[2]
  return `${name} ${version}${model.includes('[1m]') ? ' 1M' : ''}`
}

function parseJson(text: string): Record<string, unknown> | null {
  const found = text.match(/\{[\s\S]*\}/)
  if (!found) return null
  try {
    return JSON.parse(found[0])
  } catch {
    return null
  }
}

// ── the critter: 16x16 pixel art, upscaled so the terminal keeps it crisp ──

type Pose = { breathe: boolean; blink: boolean; look: -1 | 0 | 1; hop: boolean }

type Species = {
  ears: 'cat' | 'bunny' | 'antenna' | 'horns' | 'round' | 'tuft'
  halfWidth: number
  top: number
  belly: boolean
  spots: boolean
  mouth: boolean
}

function species(seed: number): Species {
  const rand = rng(seed ^ 0x51ed270b)
  return {
    ears: pick(['cat', 'bunny', 'antenna', 'horns', 'round', 'tuft'] as const, Math.floor(rand() * 6)),
    halfWidth: rand() < 0.5 ? 5.5 : 6.2,
    top: rand() < 0.5 ? 5 : 6,
    belly: rand() < 0.7,
    spots: rand() < 0.35,
    mouth: rand() < 0.6,
  }
}

function spritePixels(seed: number, p: Palette, pose: Pose): Uint8Array {
  const s = species(seed)
  const body = hexToRgb(bodyColor(seed, p.colors))
  const white: RGB = [255, 255, 255]
  const ink = mix(hexToRgb(p.dark), body, 0.15)
  const outline = mix(body, ink, 0.6)
  const light = mix(body, white, 0.35)
  const shade = mix(body, ink, 0.25)
  const bellyColor = mix(body, white, 0.5)
  const blush = hexToRgb(p.blush)
  const spotsRand = rng(seed ^ 0x2545f491)

  const N = SPRITE
  const grid: (RGB | null)[] = new Array(N * N).fill(null)
  const at = (x: number, y: number) => (x >= 0 && x < N && y >= 0 && y < N ? grid[y * N + x] : null)
  const put = (x: number, y: number, c: RGB) => {
    if (x >= 0 && x < N && y >= 0 && y < N) grid[y * N + x] = c
  }
  const mirror = (x: number, y: number, c: RGB) => {
    put(x, y, c)
    put(N - 1 - x, y, c)
  }

  const lift = pose.hop ? 1 : 0
  const top = s.top + (pose.breathe ? 1 : 0) - lift
  const bottom = 13 - lift
  const cy = (top + bottom) / 2 + 0.5
  const ry = (bottom - top + 1) / 2
  const rx = s.halfWidth + (pose.breathe ? 0.3 : 0)

  // Body with soft light from the top left and shade underneath.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - N / 2) / rx
      const dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy > 1) continue
      let c = body
      if (dy > 0.45) c = shade
      else if (dx < -0.25 && dy < -0.2) c = light
      put(x, y, c)
    }
  }

  // Ears and other head decorations (left side, mirrored).
  const ex = Math.round(N / 2 - s.halfWidth + 1.5)
  switch (s.ears) {
    case 'cat':
      for (let k = 0; k < 3; k++) for (let i = 0; i <= 2 - k; i++) mirror(ex + i, top - k, body)
      mirror(ex + 1, top, light)
      break
    case 'bunny':
      for (let k = 1; k <= 4; k++) {
        mirror(ex + 1, top - k, body)
        mirror(ex + 2, top - k, k > 1 && k < 4 ? bellyColor : body)
      }
      break
    case 'antenna':
      for (let k = 1; k <= 2; k++) mirror(ex + 2, top - k, outline)
      mirror(ex + 1, top - 3, light)
      mirror(ex + 2, top - 3, light)
      break
    case 'horns':
      mirror(ex + 1, top - 1, bellyColor)
      mirror(ex, top - 2, bellyColor)
      break
    case 'round':
      for (const [x, y] of [[0, 0], [1, 0], [0, -1], [1, -1], [-1, 0]] as const) mirror(ex + x, top + y, body)
      mirror(ex, top - 1, light)
      break
    case 'tuft':
      put(7, top - 1, body)
      put(8, top - 2, body)
      put(8, top - 1, light)
      break
  }

  // Belly patch.
  if (s.belly) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = (x + 0.5 - N / 2) / (rx - 2.6)
        const dy = (y + 0.5 - (cy + ry * 0.45)) / (ry * 0.45)
        if (dx * dx + dy * dy <= 1 && at(x, y)) put(x, y, bellyColor)
      }
    }
  }

  // Spots.
  if (s.spots) {
    for (let i = 0; i < 3; i++) {
      const x = 3 + Math.floor(spotsRand() * 3)
      const y = Math.round(cy - 1 + spotsRand() * 3)
      if (at(x, y)) mirror(x, y, shade)
    }
  }

  // Feet.
  mirror(5, bottom + 1, outline)
  mirror(4, bottom + 1, outline)

  // Outline everything drawn so far.
  const filled = grid.map(c => c !== null)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (filled[y * N + x]) continue
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
        const nx = x + (ox ?? 0)
        const ny = y + (oy ?? 0)
        return nx >= 0 && nx < N && ny >= 0 && ny < N && filled[ny * N + nx]
      })
      if (near) put(x, y, outline)
    }
  }

  // Face.
  const eyeY = Math.round(cy - ry * 0.2)
  const look = pose.look
  for (const side of [-1, 1]) {
    const ex0 = side < 0 ? 5 + look : 9 + look
    if (pose.blink) {
      put(ex0, eyeY, ink)
      put(ex0 + 1, eyeY, ink)
    } else {
      put(ex0, eyeY - 1, ink)
      put(ex0 + 1, eyeY - 1, ink)
      put(ex0, eyeY, ink)
      put(ex0 + 1, eyeY, ink)
      put(ex0 + (look > 0 ? 1 : 0), eyeY - 1, white) // sparkle
    }
  }
  put(4, eyeY + 1, mix(at(4, eyeY + 1) ?? body, blush, 0.7))
  put(11, eyeY + 1, mix(at(11, eyeY + 1) ?? body, blush, 0.7))
  if (s.mouth) {
    // A soft little smile: faint corners, darker middle.
    put(7, eyeY + 1, mix(at(7, eyeY + 1) ?? body, ink, 0.45))
    put(8, eyeY + 1, mix(at(8, eyeY + 1) ?? body, ink, 0.45))
  }

  // Upscale with nearest neighbour into RGBA.
  const S = SPRITE_SCALE
  const W = N * S
  const out = new Uint8Array(W * W * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = grid[y * N + x]
      if (!c) continue
      for (let yy = 0; yy < S; yy++) {
        for (let xx = 0; xx < S; xx++) {
          const i = ((y * S + yy) * W + (x * S + xx)) * 4
          out[i] = c[0]
          out[i + 1] = c[1]
          out[i + 2] = c[2]
          out[i + 3] = 255
        }
      }
    }
  }
  return out
}

const spriteCache = new Map<string, string>()

function poseId(pose: Pose): string {
  return `${pose.breathe ? 'b' : '-'}${pose.blink ? 'k' : '-'}${pose.look}${pose.hop ? 'h' : '-'}`
}

function spriteSource(seed: number, p: Palette, pose: Pose): { rgba: string; width: number; height: number } {
  const cacheId = `${seed}|${p.colors.join()}|${p.dark}|${poseId(pose)}`
  let rgba = spriteCache.get(cacheId)
  if (rgba === undefined) {
    if (spriteCache.size > 64) spriteCache.clear()
    rgba = toBase64(spritePixels(seed, p, pose))
    spriteCache.set(cacheId, rgba)
  }
  return { rgba, width: SPRITE * SPRITE_SCALE, height: SPRITE * SPRITE_SCALE }
}

// ── ring gauges ───────────────────────────────────────────────────────────

const ringCache = new Map<string, string>()

function ringSource(percent: number, fill: string, track: string): { rgba: string; width: number; height: number } {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  const cacheId = `${pct}|${fill}|${track}`
  let rgba = ringCache.get(cacheId)
  if (rgba === undefined) {
    if (ringCache.size > 256) ringCache.clear()
    const N = RING_PX
    const out = new Uint8Array(N * N * 4)
    const c = N / 2
    const outer = N / 2 - 1
    const inner = outer - N * 0.15
    const mid = (outer + inner) / 2
    const half = (outer - inner) / 2
    const sweep = (pct / 100) * Math.PI * 2
    const f = hexToRgb(fill)
    const t = hexToRgb(track)
    // Rounded caps at both ends of the filled arc.
    const cap = (angle: number) => [c + Math.sin(angle) * mid, c - Math.cos(angle) * mid] as const
    const [sx, sy] = cap(0)
    const [ex, ey] = cap(sweep)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - c
        const dy = y + 0.5 - c
        const d = Math.hypot(dx, dy)
        const ring = Math.min(1, Math.max(0, half + 0.5 - Math.abs(d - mid)))
        let angle = Math.atan2(dx, -dy)
        if (angle < 0) angle += Math.PI * 2
        const inArc = pct > 0 && angle <= sweep
        const capCover = pct > 0
          ? Math.max(
            Math.min(1, Math.max(0, half + 0.5 - Math.hypot(x + 0.5 - sx, y + 0.5 - sy))),
            Math.min(1, Math.max(0, half + 0.5 - Math.hypot(x + 0.5 - ex, y + 0.5 - ey))),
          )
          : 0
        const fillCover = Math.max(inArc ? ring : 0, capCover)
        const trackCover = ring
        const alpha = Math.max(fillCover, trackCover)
        if (alpha <= 0) continue
        const color = fillCover > 0 ? mix(t, f, fillCover / alpha) : t
        const i = (y * N + x) * 4
        out[i] = color[0]
        out[i + 1] = color[1]
        out[i + 2] = color[2]
        out[i + 3] = Math.round(alpha * 255)
      }
    }
    rgba = toBase64(out)
    ringCache.set(cacheId, rgba)
  }
  return { rgba, width: RING_PX, height: RING_PX }
}

function levelColor(percent: number, normal: string, p: Palette): string {
  return percent >= 90 ? p.alert : percent >= 75 ? p.warn : normal
}

// ── animation ─────────────────────────────────────────────────────────────

let bandRequestId: string | undefined
let isWorking = false
let tick = 0
let lastPose = ''
let blinkUntil = -1

function currentPose(seed: number): Pose {
  const breathe = Math.floor(tick / (isWorking ? 3 : 6)) % 2 === 1
  if (tick >= blinkUntil + 12 && (seed + tick * 7919) % 37 === 0) blinkUntil = tick + 1
  const blink = tick <= blinkUntil
  if (!isWorking) return { breathe, blink, look: 0, hop: false }
  const phase = Math.floor(tick / 8) % 4
  const look = phase === 1 ? -1 : phase === 3 ? 1 : 0
  return { breathe: false, blink, look, hop: tick % 6 < 2 }
}

async function animate($: EngineInterface): Promise<void> {
  tick++
  if (bandRequestId === undefined) return
  try {
    await drawFrame($)
  } catch {
    // The band may be collapsed or not mounted yet; try again next tick.
  }
}

async function drawFrame($: EngineInterface): Promise<void> {
  if (bandRequestId === undefined) return
  const m = await read($, meta)
  const p = await read($, palette)
  const pose = currentPose(m.seed)
  const id = poseId(pose)
  if (id === lastPose) return
  lastPose = id
  await $.ui.blit({ requestId: bandRequestId, key: 'avatar', source: spriteSource(m.seed, p, pose) })
}

// ── session data ──────────────────────────────────────────────────────────

const SYSTEM = `You label a Claude Code session for a status band. Reply with JSON only:
{"role": string, "task": string, "isNewTask": boolean}
- role: what kind of agent this session is, 1-3 lowercase words, e.g. "coding agent", "copywriter", "media editor", "researcher", "sysadmin", "designer", "data analyst", "writer", "assistant". Keep the previous role unless the work clearly changed kind.
- task: the current task as a short imperative phrase, at most 8 words, no trailing period.
- isNewTask: true only when the new message starts a different task from the current one, not when it continues, refines, answers a question, or says thanks/ok.`

async function save($: EngineInterface): Promise<void> {
  const id = await $.session.id()
  await $.store.set(`badge:${id}`, await read($, badge))
}

async function refreshMeta($: EngineInterface): Promise<void> {
  const model = await $.session.model()
  const cwd = await $.session.cwd()
  const home = await $.env.get('HOME')
  const id = await $.session.id()
  const folder = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
  const next: Meta = { model: prettyModel(model), folder, seed: hash(id) }
  const current = await read($, meta)
  if (current.model !== next.model || current.folder !== next.folder || current.seed !== next.seed) {
    await update($, meta, () => next)
  }
}

async function refreshPalette($: EngineInterface): Promise<void> {
  const home = await $.env.get('HOME')
  let toml: string
  try {
    toml = await $.fs.read(`${home}/${THEME_COLORS}`)
  } catch {
    return
  }
  const values: Record<string, string> = {}
  for (const line of toml.split('\n')) {
    const m = line.match(/^\s*([a-z_]+)\s*=\s*"(#[0-9a-fA-F]{6})/)
    if (m?.[1] && m[2]) values[m[1]] = m[2].toLowerCase()
  }
  const dark = values.background ?? '#000000'
  const colors = [...new Set(PALETTE_KEYS.map(k => values[k]).filter((c): c is string => Boolean(c)))]
    .filter(c => Math.abs(luminance(c) - luminance(dark)) > 60)
  if (colors.length === 0) return
  const next: Palette = {
    colors,
    dark,
    warn: values.yellow ?? values.orange ?? '#e8b84a',
    alert: values.red ?? '#ea9e9e',
    track: values.selection_background ?? values.lighter_background ?? values.muted ?? '#2e2e2e',
    blush: values.bright_red ?? values.red ?? '#f4c4c4',
  }
  const current = await read($, palette)
  if (JSON.stringify(current) !== JSON.stringify(next)) await update($, palette, () => next)
}

async function storeUsage($: EngineInterface, figures: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): Promise<void> {
  const limit = (kind: string) => figures.rateLimits.find(r => r.kind === kind)
  const next: Usage = {
    context: figures.context.percent,
    filled: figures.context.tokens,
    window: figures.context.window,
    fiveHour: limit('five_hour')?.percentUsed,
    fiveHourResets: limit('five_hour')?.resetsAt,
    sevenDay: limit('seven_day')?.percentUsed,
    sevenDayResets: limit('seven_day')?.resetsAt,
    usd: figures.cost?.usd,
    // Rounded to the minute so the "resets in" text moves without redrawing every tick.
    now: Math.floor((await $.clock.now()) / 60000) * 60000,
  }
  const current = await read($, usage)
  if (JSON.stringify(current) !== JSON.stringify(next)) await update($, usage, () => next)
}

async function refreshUsage($: EngineInterface): Promise<void> {
  await storeUsage($, await $.session.usage())
}

async function classify($: EngineInterface, text: string): Promise<void> {
  const current = await read($, badge)
  const prompt = [
    `Current role: ${current.role}`,
    `Current task: ${current.task}`,
    `Earlier tasks: ${current.history.join('; ') || 'none'}`,
    `New message from the user:\n${text.slice(0, 4000)}`,
  ].join('\n')
  const result = await $.model.complete({
    model: 'haiku',
    system: SYSTEM,
    prompt,
    maxTokens: 150,
    effort: 'low',
    timeoutMs: 20000,
  })
  if (!result.isAnswered) return
  const parsed = parseJson(result.text)
  if (!parsed) return
  const role = typeof parsed.role === 'string' && parsed.role.trim() ? parsed.role.trim().toLowerCase() : current.role
  const task = typeof parsed.task === 'string' && parsed.task.trim() ? parsed.task.trim() : current.task
  const isFirst = current.role === 'new agent'
  const isNewTask = parsed.isNewTask === true && !isFirst && task !== current.task

  await update($, badge, b => ({
    role,
    task,
    history: isNewTask ? [b.task, ...b.history].slice(0, HISTORY_LIMIT) : b.history,
  }))
  await save($)
}

async function refreshAll($: EngineInterface): Promise<void> {
  try {
    await refreshMeta($)
    await refreshPalette($)
    await refreshUsage($)
  } catch {
    // Figures refresh again on the next tick.
  }
}

// Prompts waiting to be labelled, handled one at a time in order.
const pendingLabels: string[] = []
let isLabelling = false

async function drainLabels($: EngineInterface): Promise<void> {
  if (isLabelling) return
  isLabelling = true
  try {
    while (pendingLabels.length > 0) {
      const text = pendingLabels.shift() as string
      try {
        await classify($, text)
      } catch {
        // A failed label leaves the band as it was.
      }
    }
  } finally {
    isLabelling = false
  }
}

// ── drawing ───────────────────────────────────────────────────────────────

type Gauge = { label: string; percent: number; detail: string }

function gauges(u: Usage): Gauge[] {
  const list: Gauge[] = []
  if (u.window !== undefined) {
    const left = u.filled === undefined ? u.window : Math.max(0, u.window - u.filled)
    list.push({ label: 'Context', percent: u.context ?? 0, detail: `${shortCount(left)} left` })
  }
  if (u.fiveHour !== undefined) {
    list.push({ label: '5-hour limit', percent: u.fiveHour, detail: untilText(u.fiveHourResets, u.now) })
  }
  if (u.sevenDay !== undefined) {
    list.push({ label: 'Weekly limit', percent: u.sevenDay, detail: untilText(u.sevenDayResets, u.now) })
  }
  return list
}

// A pill-shaped bar with eighth-block precision, for narrower windows.
function smoothBar(percent: number): { full: string; partial: string; empty: string } {
  const eighths = Math.round((Math.max(0, Math.min(100, percent)) / 100) * BAR_CELLS * 8)
  const fullCells = Math.floor(eighths / 8)
  const rest = eighths % 8
  const partial = rest > 0 ? ' ▏▎▍▌▋▊▉'.charAt(rest) : ''
  const empty = ' '.repeat(BAR_CELLS - fullCells - (partial ? 1 : 0))
  return { full: '█'.repeat(fullCells), partial, empty }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const id = await $.session.id()
    const saved = (await $.store.get(`badge:${id}`)) as Badge | undefined
    const current = await read($, badge)
    if (saved && current.role === 'new agent') await update($, badge, () => saved)
    await refreshAll($)
    // Catch /model switches, theme changes and rate-limit drift between turns.
    $.clock.every(5000, () => refreshAll($))
    $.clock.every(TICK_MS, () => animate($))
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    const text = e.text.trim()
    if (e.origin.kind === 'composer' && text && !text.startsWith('/')) {
      // Label in the background so the prompt is never held up.
      pendingLabels.push(text)
      $.clock.after(0, () => drainLabels($))
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await storeUsage($, e)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true
    await refreshMeta($)
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) isWorking = false
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.view.agentId !== undefined) return next(e)

    const b = await read($, badge)
    const m = await read($, meta)
    const p = await read($, palette)
    const u = await read($, usage)
    const body = bodyColor(m.seed, p.colors)
    const name = critterName(m.seed)
    const width = e.props.bodyColumns
    const list = gauges(u)
    const spent = u.usd === undefined ? undefined : `$${u.usd.toFixed(2)}`

    const ringsWidth = list.length * GAUGE_WIDTH + (spent ? SPENT_WIDTH : 0)
    const avatarWidth = AVATAR_COLUMNS + 1
    const mode = e.surface !== 'terminal'
      ? (width >= INFO_MIN + COMPACT_WIDTH ? 'bars' : 'none')
      : width >= avatarWidth + INFO_MIN + ringsWidth
        ? 'rings'
        : width >= avatarWidth + INFO_MIN + COMPACT_WIDTH ? 'bars' : 'none'
    const sideWidth = mode === 'rings' ? ringsWidth : mode === 'bars' ? COMPACT_WIDTH : 0
    const infoWidth = Math.max(10, width - avatarWidth - sideWidth - 1)

    const info = (Box: any, Text: any) => (
      <Box flexDirection="column" marginLeft={1} width={infoWidth}>
        <Text wrap="truncate">
          <Text bold color={body}>{name}</Text>
          <Text>  </Text>
          <Text color={p.dark} backgroundColor={body} bold>{` ${b.role.toUpperCase()} `}</Text>
        </Text>
        <Text wrap="truncate">
          <Text color={body}>▸ </Text>
          <Text bold>{b.task}</Text>
        </Text>
        <Text dimColor wrap="truncate">
          {b.history.length > 0 ? `↳ earlier: ${b.history.join('  ·  ')}` : '↳ earlier: nothing yet'}
        </Text>
        <Text dimColor wrap="truncate">{`${m.model}  ·  ${m.folder}`}</Text>
      </Box>
    )

    const bars = (Box: any, Text: any) => (
      <Box flexDirection="column" width={COMPACT_WIDTH} marginLeft={1}>
        {list.map(g => {
          const color = levelColor(g.percent, body, p)
          const bar = smoothBar(g.percent)
          return (
            <Text wrap="truncate">
              <Text dimColor>{g.label.split(' ')[0]!.padEnd(8)}</Text>
              <Text color={color} backgroundColor={p.track}>{bar.full + bar.partial}</Text>
              <Text backgroundColor={p.track}>{bar.empty}</Text>
              <Text color={color} bold>{` ${String(Math.round(g.percent)).padStart(3)}%`}</Text>
              <Text dimColor>{g.detail ? `  ${g.detail.replace('resets ', '↻ ')}` : ''}</Text>
            </Text>
          )
        })}
        {spent ? <Text dimColor wrap="truncate">{`Spent   ${spent} this session`}</Text> : null}
      </Box>
    )

    if (e.surface === 'terminal') {
      const { Box, Text, Image } = $.ui.resolve(e)
      bandRequestId = e.requestId
      isWorking = isWorking || e.props.isWorking
      const pose = currentPose(m.seed)
      lastPose = poseId(pose)

      const rings = (
        <Box flexDirection="row" width={ringsWidth}>
          {list.map((g, i) => {
            const color = levelColor(g.percent, body, p)
            return (
              <Box flexDirection="row" width={GAUGE_WIDTH}>
                <Image
                  key={`ring-${i}`}
                  source={ringSource(g.percent, color, p.track)}
                  columns={RING_COLUMNS}
                  rows={RING_ROWS}
                  alt={`${Math.round(g.percent)}%`}
                />
                <Box flexDirection="column" marginLeft={1} width={GAUGE_TEXT}>
                  <Text dimColor wrap="truncate">{g.label}</Text>
                  <Text wrap="truncate">
                    <Text color={color} bold>{`${Math.round(g.percent)}%`}</Text>
                    <Text dimColor> used</Text>
                  </Text>
                  <Text dimColor wrap="truncate">{g.detail}</Text>
                </Box>
              </Box>
            )
          })}
          {spent ? (
            <Box flexDirection="column" width={SPENT_WIDTH}>
              <Text dimColor>Spent</Text>
              <Text bold color={body}>{spent}</Text>
              <Text dimColor>this session</Text>
            </Box>
          ) : null}
        </Box>
      )

      return (
        <Box flexDirection="row" paddingTop={1}>
          <Image
            key="avatar"
            source={spriteSource(m.seed, p, pose)}
            columns={AVATAR_COLUMNS}
            rows={AVATAR_ROWS}
            alt={name}
          />
          {info(Box, Text)}
          {mode === 'rings' ? rings : mode === 'bars' ? bars(Box, Text) : null}
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" paddingTop={1}>
        <Text color={body}>ʕ•ᴥ•ʔ</Text>
        {info(Box, Text)}
        {mode === 'bars' ? bars(Box, Text) : null}
      </Box>
    )
  })
}
