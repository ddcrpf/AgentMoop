import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import type { SnakeGame } from '../types'
import { boardSize, newSnake, placeFood, snakeCells, stepSnake, turnSnake } from './game'

const BAND_PROPS = { hasSurvey: false, isWorking: true, maxRows: 13, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} } as const
const BAND = { plugin: 'agentmoop', component: 'AbovePrompt', props: BAND_PROPS } as const
const IDLE = { ...BAND_PROPS, isWorking: false } as const
const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const LOGAN = { id: 'u1', handle: 'logan404', conversationId: null, unread: 0 }
const REFLEX_WORDS = /^(Wait\.\.\.|Now!|Too soon|\d+ ms)$/
const HEAD = 0x86efac
type Row = { id: number; senderHandle: string; body: string }
type Server = { inbox?: Row[]; contacts?: { id: string; handle: string; conversationId: string | null; unread: number }[] }

// Stands in beneath the plugin: the AgentMoop server (answering reads) and the store.
function fakeWorld(on: On, server: Server, entries: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { lastSeenMessageId: 0, ...entries }
  on('store.get', (_$, e) => ({ value: store[e.key] }))
  on('store.set', (_$, e) => { store[e.key] = e.value; return { value: undefined } })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no surface places panes' } }))
  on('ui.close', () => ({ value: undefined }))
  on('mcp.connect', () => ({ value: { isConnected: true, server: 'agentmoop' } }))
  on('mcp.call', (_$, e) => {
    const text = (s: unknown) => ({ value: { content: [{ type: 'text', text: JSON.stringify(s) }], isError: false } })
    if (e.tool === 'list_inbox') return text({ items: (server.inbox ?? []).filter(m => m.id > Number(e.args.after_id ?? 0)), nextCursor: null })
    if (e.tool === 'list_contacts') return text({ contacts: server.contacts ?? [] })
    if (e.tool === 'read_conversation') return text({ items: [], nextCursor: null })
    if (e.tool.startsWith('sponsored_')) throw new Error('sponsored tool called')
    return text({ counted: true })
  })
  return store
}

// The snake's head on a drawn board, read back from the Raster's cells.
function headOf(cells: string, cols: number): [number, number] | null {
  const bytes = Uint8Array.from(atob(cells), c => c.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < bytes.length / 12; i++) if (view.getUint32(i * 12 + 4, true) === HEAD) return [i % cols, Math.floor(i / cols)]
  return null
}

const fixed = (value: number) => () => value

test('snake rules: moves, turns but never reverses, eats and grows, and ends at walls and itself', () => {
  const start = newSnake(20, 6, 3, fixed(0))
  expect(start.snake).toEqual([[10, 3], [9, 3], [8, 3]])
  expect(turnSnake(start, 'left')).toBe(start)
  const moved = stepSnake(turnSnake(start, 'up'), fixed(0))
  expect(moved.snake[0]).toEqual([10, 2])
  expect(moved.snake).toHaveLength(3)
  const fed = stepSnake({ ...start, food: [11, 3] }, fixed(0))
  expect(fed.score).toBe(1)
  expect(fed.snake).toHaveLength(4)
  expect(fed.snake.some(c => c[0] === fed.food[0] && c[1] === fed.food[1])).toBe(false)
  const wall = stepSnake({ ...start, snake: [[19, 0], [18, 0]] }, fixed(0))
  expect(wall.over).toBe(true)
  const coiled: SnakeGame = { ...start, snake: [[5, 2], [6, 2], [6, 3], [5, 3], [4, 3]], dir: 'up', nextDir: 'right', food: [0, 0] }
  expect(stepSnake(coiled, fixed(0)).over).toBe(true)
  expect(stepSnake({ ...start, over: true }, fixed(0))).toEqual({ ...start, over: true })
  expect(placeFood(2, 1, [[0, 0]], fixed(0.99))).toEqual([1, 0])
  expect(boardSize(200, 50)).toEqual({ cols: 40, rows: 10 })
  expect(boardSize(30, 9)).toEqual({ cols: 30, rows: 6 })
  expect(atob(snakeCells(start)).length).toBe(20 * 6 * 12)
  expect(headOf(snakeCells(start), 20)).toEqual([10, 3])
})

test('while Claude works the friend line keeps its friends and adds a play button; never when collapsed', async ($, on) => {
  const clock = mock.clock(on)
  fakeWorld(on, { contacts: [LOGAN] })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, props: IDLE, surface: 'terminal' })
  expect(await ui.find({ key: 'friend-logan404' })).toBeDefined()
  expect(await ui.find({ key: 'game-play' })).toBeUndefined()
  await ui.redraw(BAND_PROPS)
  expect(await ui.find({ key: 'friend-logan404' })).toBeDefined()
  expect((await ui.find({ key: 'game-play' }))?.text).toBe('play')
  await ui.press({ key: 'agentmoop-hide' })
  expect(await ui.find({ key: 'agentmoop-show' })).toBeDefined()
  expect(await ui.find({ key: 'game-play' })).toBeUndefined()
  await ui.unmount()
})

test("play starts the game; Don't offer games on its end screen is stored and hides the play button", async ($, on) => {
  const clock = mock.clock(on)
  const store = fakeWorld(on, { contacts: [LOGAN] })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'game-play' })
  expect(await ui.find({ key: 'reflex-hit' })).toBeDefined()
  expect(await ui.find({ key: 'friend-logan404' })).toBeUndefined()
  await ui.press({ key: 'reflex-hit' })
  await ui.press({ key: 'game-off' })
  expect(store.gamesOff).toBe(true)
  expect(await ui.find({ key: 'friend-logan404' })).toBeDefined()
  expect(await ui.find({ key: 'game-play' })).toBeUndefined()
  await ui.unmount()
})

test('gamesOff from the store keeps the play button away from the start', async ($, on) => {
  const clock = mock.clock(on)
  fakeWorld(on, { contacts: [LOGAN] }, { gamesOff: true })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'friend-logan404' })).toBeDefined()
  expect(await ui.find({ key: 'game-play' })).toBeUndefined()
  await ui.unmount()
})

test('snake on the terminal: a Raster board, ticks every 150 ms, arrows and hotkeys steer, a wall ends it', async ($, on) => {
  const clock = mock.clock(on)
  fakeWorld(on, { contacts: [LOGAN] })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'game-play' })
  const board = async () => (await ui.find({ key: 'snake-board' }))!
  expect((await board()).props).toMatchObject({ columns: 40, rows: 10 })
  expect(headOf(String((await board()).props.cells), 40)).toEqual([20, 5])
  await clock.advance(150)
  expect(headOf(String((await board()).props.cells), 40)).toEqual([21, 5])
  await ui.key({ key: 'up', in: 'snake-keys' })
  await clock.advance(150)
  expect(headOf(String((await board()).props.cells), 40)).toEqual([21, 4])
  expect((await ui.find({ key: 'steer-left' }))?.props).toMatchObject({ hotkey: 'a' })
  await ui.press({ key: 'steer-left' })
  await clock.advance(150)
  expect(headOf(String((await board()).props.cells), 40)).toEqual([20, 4])
  expect((await ui.find({ type: 'Text', text: /^Score / }))?.text).toMatch(/^Score \d+ {2}Best \d+$/)
  await clock.advance(150 * 30)
  expect(await ui.find({ type: 'Text', text: /Game over\./ })).toBeDefined()
  expect(await ui.find({ key: 'game-again' })).toBeDefined()
  const cells = String((await board()).props.cells)
  await clock.advance(1500)
  expect(String((await board()).props.cells)).toBe(cells)
  // Claude finishes with the game already over: it goes, and the band shows the friend line again.
  await ui.redraw(IDLE)
  await clock.settle()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ key: 'friend-logan404' })).toBeDefined()
  await ui.unmount()
})

test('snake pauses with "Make the window wider to play." when the band gets narrower than its board', async ($, on) => {
  const clock = mock.clock(on)
  fakeWorld(on, {})
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'game-play' })
  await ui.redraw({ ...BAND_PROPS, bodyColumns: 30 })
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /Make the window wider to play\./ })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ key: 'game-resume' })).toBeUndefined()
  await clock.advance(10_000)
  await ui.redraw(BAND_PROPS)
  expect(await ui.find({ type: 'Text', text: /Game paused\./ })).toBeDefined()
  await ui.press({ key: 'game-resume' })
  expect(headOf(String((await ui.find({ key: 'snake-board' }))!.props.cells), 40)).toEqual([20, 5])
  await ui.unmount()
})

test('snake asks for a wider window under 20 columns', async ($, on) => {
  const clock = mock.clock(on)
  fakeWorld(on, {})
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND_PROPS, bodyColumns: 19 }, surface: 'terminal' })
  await ui.press({ key: 'game-play' })
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /Make the window wider to play\./ })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.unmount()
})

test('reflex elsewhere: Wait, then Now after 1 to 4 seconds; too soon is said; the best stays on this machine', async ($, on) => {
  const clock = mock.clock(on)
  const store = fakeWorld(on, {})
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'game-play' })
  expect((await ui.find({ type: 'Text', text: REFLEX_WORDS }))?.text).toBe('Wait...')
  await ui.press({ key: 'reflex-hit' })
  expect((await ui.find({ type: 'Text', text: REFLEX_WORDS }))?.text).toBe('Too soon')
  await ui.press({ key: 'game-again' })
  await clock.advance(999)
  expect((await ui.find({ type: 'Text', text: REFLEX_WORDS }))?.text).toBe('Wait...')
  await clock.advance(3001)
  expect((await ui.find({ type: 'Text', text: REFLEX_WORDS }))?.text).toBe('Now!')
  await ui.press({ key: 'reflex-hit' })
  const words = (await ui.find({ type: 'Text', text: REFLEX_WORDS }))?.text ?? ''
  expect(words).toMatch(/^\d+ ms$/)
  expect(store.reflexBest).toBe(Number.parseInt(words, 10))
  await ui.unmount()
})

test('Play again is offered only while Claude works', async ($, on) => {
  const clock = mock.clock(on)
  fakeWorld(on, {})
  await $.session.start(START)
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'game-play' })
  await ui.redraw(IDLE)
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /Claude is done\./ })).toBeDefined()
  await ui.press({ key: 'game-resume' })
  await clock.advance(4000)
  await ui.press({ key: 'reflex-hit' })
  expect((await ui.find({ type: 'Text', text: REFLEX_WORDS }))?.text).toMatch(/^\d+ ms$/)
  expect(await ui.find({ key: 'game-again' })).toBeUndefined()
  expect(await ui.find({ key: 'game-close' })).toBeDefined()
  expect(await ui.find({ key: 'game-off' })).toBeDefined()
  await ui.unmount()
})

test('a friend card pauses the game with its state; it resumes only on Resume; Claude done offers Resume or Close', async ($, on) => {
  const clock = mock.clock(on)
  const inbox: Row[] = []
  fakeWorld(on, { inbox })
  await $.session.start(START)
  await clock.advance(19_700)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'game-play' })
  inbox.push({ id: 1, senderHandle: 'logan404', body: 'lunch?' })
  await clock.advance(450)
  expect(await ui.find({ type: 'Text', text: /lunch\?/ })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await clock.advance(10_000)
  await ui.press({ key: 'dismiss-1' })
  expect(await ui.find({ type: 'Text', text: /Game paused\./ })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await ui.press({ key: 'game-resume' })
  expect(await ui.find({ type: 'Text', text: /Game over\./ })).toBeUndefined()
  const before = headOf(String((await ui.find({ key: 'snake-board' }))!.props.cells), 40)!
  await clock.advance(150)
  expect(headOf(String((await ui.find({ key: 'snake-board' }))!.props.cells), 40)).toEqual([before[0] + 1, before[1]])
  await ui.redraw(IDLE)
  await clock.settle()
  const paused = await ui.find({ type: 'Text', text: /Claude is done\./ })
  expect(paused).toBeDefined()
  await clock.advance(10_000)
  expect(await ui.find({ type: 'Text', text: /Claude is done\./ })).toEqual(paused)
  expect(await ui.find({ key: 'game-resume' })).toBeDefined()
  await ui.press({ key: 'game-close' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Claude is done\./ })).toBeUndefined()
  await ui.unmount()
})

test('precedence: friend cards > open inline conversation > game > friend line', async ($, on) => {
  const clock = mock.clock(on)
  const inbox: Row[] = []
  fakeWorld(on, { inbox, contacts: [LOGAN] })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, props: IDLE, surface: 'terminal' })
  const showing = async () => ({
    card: !!(await ui.find({ key: `dismiss-${inbox.at(-1)?.id ?? 0}` })),
    inline: !!(await ui.find({ key: 'conv-close' })),
    game: !!(await ui.find({ key: 'game-close' })),
    friends: !!(await ui.find({ key: 'friend-logan404' })),
    play: !!(await ui.find({ key: 'game-play' })),
  })
  const none = { card: false, inline: false, game: false, friends: false, play: false }
  expect(await showing()).toEqual({ ...none, friends: true })
  await ui.press({ key: 'friend-logan404' })
  await ui.redraw(BAND_PROPS)
  expect(await showing()).toEqual({ ...none, inline: true, friends: true })
  // A friend card above everything (the open conversation stays beneath it).
  inbox.push({ id: 1, senderHandle: 'logan404', body: 'card text' })
  await clock.advance(20_000)
  expect(await showing()).toEqual({ ...none, card: true, inline: true })
  await ui.press({ key: 'dismiss-1' })
  await ui.press({ key: 'conv-close' })
  expect(await showing()).toEqual({ ...none, friends: true, play: true })
  // Start the game just before the next poll, so a long clock advance never runs under its ticks.
  await clock.advance(19_700)
  await ui.press({ key: 'game-play' })
  expect(await showing()).toEqual({ ...none, game: true })
  // A friend card above the game.
  inbox.push({ id: 2, senderHandle: 'logan404', body: 'again' })
  await clock.advance(450)
  expect(await showing()).toEqual({ ...none, card: true })
  await ui.press({ key: 'dismiss-2' })
  await ui.press({ key: 'game-close' })
  expect(await showing()).toEqual({ ...none, friends: true, play: true })
  await ui.unmount()
})

test('/moop-games off hides the play button and stores it; on brings it back', async ($, on) => {
  const clock = mock.clock(on)
  const store = fakeWorld(on, { contacts: [LOGAN] })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'game-play' })).toBeDefined()
  expect((await $.command.run({ ...TYPED, command: 'moop-games', args: 'off' })).text).toBe('Games off.')
  expect(store.gamesOff).toBe(true)
  expect(await ui.find({ key: 'game-play' })).toBeUndefined()
  expect((await $.command.run({ ...TYPED, command: 'moop-games', args: 'on' })).text).toBe('Games on.')
  expect(store.gamesOff).toBe(false)
  expect(await ui.find({ key: 'game-play' })).toBeDefined()
  expect((await $.command.run({ ...TYPED, command: 'moop-games', args: 'maybe' })).text).toBe('Usage: /moop-games on|off')
  await ui.unmount()
})
