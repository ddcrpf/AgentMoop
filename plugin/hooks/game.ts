import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import type { Cell, Direction, Game, OpenFriend, PingCard, ReflexGame, SnakeGame } from '../types'
import { toBase64 } from './share'

// State is declared in each file that reads or writes it (the engine lists a module's state by its own consts).
const cards = atom({ plugin: 'agentmoop', key: 'cards' } as const, [] as PingCard[])
const game = atom({ plugin: 'agentmoop', key: 'game' } as const, null as Game | null)
const gamesOff = atom({ plugin: 'agentmoop', key: 'gamesOff' } as const, false)
const openFriend = atom({ plugin: 'agentmoop', key: 'openFriend' } as const, null as OpenFriend | null)
const paneInline = atom({ plugin: 'agentmoop', key: 'paneInline' } as const, false)

export const GAMES_OFF_KEY = 'gamesOff'
const SNAKE_BEST_KEY = 'snakeBest'
const REFLEX_BEST_KEY = 'reflexBest'
export const TICK_MS = 150
export const MIN_COLUMNS = 20
const MAX_COLS = 40
const MAX_ROWS = 10
const MIN_ROWS = 4
// The band's rows besides the board: the score line and the controls.
const CHROME_ROWS = 3
const REFLEX_MIN_MS = 1000
const REFLEX_SPREAD_MS = 3000
const DEFAULT_COLOR = 0x01000000
const FIELD = 0x1c1c1c
const BODY = 0x22c55e
const HEAD = 0x86efac
const FOOD = 0xef4444
const BLOCK = 0x2588
const DOT = 0x2022

const MOVES: Record<Direction, Cell> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }
export const isDirection = (value: unknown): value is Direction => typeof value === 'string' && value in MOVES

// The running game's one timer, and whether Claude works (from the turn events and the band's props).
export type GameRuntime = { timer: Timer | null; working: boolean; lastWorking: boolean }

export function newGameRuntime(): GameRuntime {
  return { timer: null, working: false, lastWorking: false }
}

type Rand = () => number
const random: Rand = () => Math.random()
const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1]

export function boardSize(columns: number, maxRows: number) {
  return { cols: Math.max(MIN_COLUMNS, Math.min(MAX_COLS, columns)), rows: Math.max(MIN_ROWS, Math.min(MAX_ROWS, maxRows - CHROME_ROWS)) }
}

export function placeFood(cols: number, rows: number, snake: readonly Cell[], rand: Rand): Cell {
  const free: Cell[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!snake.some(c => c[0] === x && c[1] === y)) free.push([x, y])
  return free[Math.floor(rand() * free.length)] ?? [0, 0]
}

export function newSnake(cols: number, rows: number, best: number, rand: Rand): SnakeGame {
  const x = Math.floor(cols / 2)
  const y = Math.floor(rows / 2)
  const snake: Cell[] = [[x, y], [x - 1, y], [x - 2, y]]
  return { kind: 'snake', cols, rows, snake, dir: 'right', nextDir: 'right', food: placeFood(cols, rows, snake, rand), score: 0, best, over: false }
}

export function turnSnake(g: SnakeGame, dir: Direction): SnakeGame {
  return dir === OPPOSITE[g.dir] ? g : { ...g, nextDir: dir }
}

// One move: a wall or the snake's own body ends the game; food grows it and scores.
export function stepSnake(g: SnakeGame, rand: Rand): SnakeGame {
  if (g.over) return g
  const head = g.snake[0]!
  const [dx, dy] = MOVES[g.nextDir]
  const next: Cell = [head[0] + dx, head[1] + dy]
  const eats = same(next, g.food)
  const body = eats ? g.snake : g.snake.slice(0, -1)
  const hitsWall = next[0] < 0 || next[1] < 0 || next[0] >= g.cols || next[1] >= g.rows
  if (hitsWall || body.some(c => same(c, next))) return { ...g, dir: g.nextDir, over: true, best: Math.max(g.best, g.score) }
  const snake = [next, ...body]
  if (!eats) return { ...g, dir: g.nextDir, snake }
  return { ...g, dir: g.nextDir, snake, score: g.score + 1, food: placeFood(g.cols, g.rows, snake, rand) }
}

// The board as a Raster's cells: little-endian [codePoint, foreground, background] per cell.
export function snakeCells(g: SnakeGame): string {
  const bytes = new Uint8Array(g.cols * g.rows * 12)
  const view = new DataView(bytes.buffer)
  const put = (cell: Cell, glyph: number, fg: number) => {
    const at = (cell[1] * g.cols + cell[0]) * 12
    view.setUint32(at, glyph, true)
    view.setUint32(at + 4, fg, true)
    view.setUint32(at + 8, FIELD, true)
  }
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) put([x, y], 0x20, DEFAULT_COLOR)
  put(g.food, DOT, FOOD)
  g.snake.forEach((cell, i) => put(cell, BLOCK, i === 0 ? HEAD : BODY))
  return toBase64(bytes)
}

const numberOr = <T>(value: unknown, fallback: T) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

function stopTimer(rt: GameRuntime) {
  rt.timer?.cancel()
  rt.timer = null
}

// A friend card, or an open reply or inline conversation, sits above the game.
export async function gameCovered($: EngineInterface) {
  const inline = (await read($, paneInline)) && (await read($, openFriend)) !== null
  return (await read($, cards)).length > 0 || inline
}

// A game still being played: a snake not yet over, a reflex round not yet answered.
const isActive = (g: Game) => (g.kind === 'snake' ? !g.over : g.phase === 'wait' || g.phase === 'now')

export async function pauseGame($: EngineInterface, rt: GameRuntime, reason: 'covered' | 'done') {
  stopTimer(rt)
  await update($, game, g => (g && !g.paused && isActive(g) ? { ...g, paused: reason } : g))
}

async function snakeTick($: EngineInterface, rt: GameRuntime) {
  if (await gameCovered($)) { await pauseGame($, rt, 'covered'); return }
  await update($, game, g => (g?.kind === 'snake' && !g.paused && !g.over ? { ...stepSnake(g, random), paused: null } : g))
  const now = await read($, game)
  if (now?.kind !== 'snake' || now.paused || !now.over) return
  stopTimer(rt)
  if (now.best === now.score && now.score > 0) await $.store.set(SNAKE_BEST_KEY, now.score)
}

async function reflexGo($: EngineInterface, rt: GameRuntime) {
  rt.timer = null
  if (await gameCovered($)) { await pauseGame($, rt, 'covered'); return }
  const nowAt = await $.clock.now()
  await update($, game, g => (g?.kind === 'reflex' && g.phase === 'wait' && !g.paused ? { ...g, phase: 'now' as const, nowAt } : g))
}

// Starts the timer the game needs now: the snake's tick, or the reflex round's random wait.
function runTimer($: EngineInterface, rt: GameRuntime, g: Game) {
  stopTimer(rt)
  if (g.kind === 'snake' && !g.over) rt.timer = $.clock.every(TICK_MS, () => { void snakeTick($, rt).catch(() => undefined) })
  if (g.kind === 'reflex' && g.phase === 'wait') {
    rt.timer = $.clock.after(REFLEX_MIN_MS + Math.floor(random() * (REFLEX_SPREAD_MS + 1)), () => { void reflexGo($, rt).catch(() => undefined) })
  }
}

async function setGame($: EngineInterface, rt: GameRuntime, g: Game) {
  await update($, game, () => g)
  runTimer($, rt, g)
}

export async function startSnake($: EngineInterface, rt: GameRuntime, columns: number, maxRows: number) {
  const { cols, rows } = boardSize(columns, maxRows)
  const best = numberOr(await $.store.get(SNAKE_BEST_KEY), 0)
  await setGame($, rt, { ...newSnake(cols, rows, best, random), paused: null })
}

export async function startReflex($: EngineInterface, rt: GameRuntime) {
  const best = numberOr<number | null>(await $.store.get(REFLEX_BEST_KEY), null)
  const round: ReflexGame = { kind: 'reflex', phase: 'wait', nowAt: 0, ms: null, best }
  await setGame($, rt, { ...round, paused: null })
}

// Resumes where it stopped; a reflex round caught mid-wait starts its wait again.
export async function resumeGame($: EngineInterface, rt: GameRuntime) {
  const g = await read($, game)
  if (!g) return
  const restart = g.kind === 'reflex' && (g.phase === 'wait' || g.phase === 'now')
  await setGame($, rt, restart ? { ...g, phase: 'wait', paused: null } : { ...g, paused: null })
}

export async function closeGame($: EngineInterface, rt: GameRuntime) {
  stopTimer(rt)
  await update($, game, () => null)
}

// Claude finished: a game mid-play pauses ("Claude is done."); a finished one goes, freeing the band.
export async function claudeDone($: EngineInterface, rt: GameRuntime) {
  const g = await read($, game)
  if (!g || g.paused) return
  if (isActive(g)) await pauseGame($, rt, 'done')
  else await closeGame($, rt)
}

// The snake's board no longer fits the band's width (or the band is under the minimum).
export function boardTooWide(g: SnakeGame | ReflexGame, columns: number) {
  return g.kind === 'snake' && columns < Math.max(MIN_COLUMNS, g.cols)
}

export async function steer($: EngineInterface, dir: Direction) {
  await update($, game, g => (g?.kind === 'snake' && !g.paused && !g.over ? { ...turnSnake(g, dir), paused: null } : g))
}

// The big button: too soon while waiting, else the reaction time, the best kept on this machine.
export async function reflexPress($: EngineInterface, rt: GameRuntime) {
  const g = await read($, game)
  if (g?.kind !== 'reflex' || g.paused) return
  if (g.phase === 'wait') {
    stopTimer(rt)
    await update($, game, () => ({ ...g, phase: 'early' as const }))
    return
  }
  if (g.phase !== 'now') return
  const ms = Math.max(0, Math.round((await $.clock.now()) - g.nowAt))
  const best = g.best === null ? ms : Math.min(g.best, ms)
  await update($, game, () => ({ ...g, phase: 'result' as const, ms, best }))
  if (best === ms) await $.store.set(REFLEX_BEST_KEY, ms)
}

export async function turnOffGames($: EngineInterface, rt: GameRuntime) {
  await closeGame($, rt)
  await update($, gamesOff, () => true)
  await $.store.set(GAMES_OFF_KEY, true)
}

export async function loadGamesOff($: EngineInterface) {
  if ((await $.store.get(GAMES_OFF_KEY)) === true) await update($, gamesOff, () => true)
}
