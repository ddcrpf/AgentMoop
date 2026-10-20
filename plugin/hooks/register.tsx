import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Conversation, Friend, Game, OpenFriend, PingCard } from '../types'

import { callAgentMoop, flash, newSession } from './client'
import type { Session } from './client'
import { forgetConversation, loadConversation, PANE_ID, refreshFriends } from './friends'
import { boardTooWide, claudeDone, GAMES_OFF_KEY, isDirection, loadGamesOff, newGameRuntime, pauseGame, steer, turnOffGames } from './game'
import type { GameRuntime } from './game'
import { gameView, startGame } from './game-view'
import { pollInbox } from './inbox'
import { checkFile, isRateLimited, parseShare, uploadFile } from './share'
import type { Share } from './share'
import { cardList, COLLAPSED_KEY, conversationView, friendLine } from './views'

export { parseInbox } from './inbox'

// State is declared in each file that reads or writes it (the engine lists a module's state by its own consts).
const cards = atom({ plugin: 'agentmoop', key: 'cards' } as const, [] as PingCard[])
const collapsed = atom({ plugin: 'agentmoop', key: 'collapsed' } as const, false)
const conversation = atom({ plugin: 'agentmoop', key: 'conversation' } as const, null as Conversation | null)
const friendPage = atom({ plugin: 'agentmoop', key: 'friendPage' } as const, 0)
const friends = atom({ plugin: 'agentmoop', key: 'friends' } as const, [] as Friend[])
const game = atom({ plugin: 'agentmoop', key: 'game' } as const, null as Game | null)
const gamesOff = atom({ plugin: 'agentmoop', key: 'gamesOff' } as const, false)
const openFriend = atom({ plugin: 'agentmoop', key: 'openFriend' } as const, null as OpenFriend | null)
// True when the conversation pane could not be placed, so the band shows it inline instead.
const paneInline = atom({ plugin: 'agentmoop', key: 'paneInline' } as const, false)
const replying = atom({ plugin: 'agentmoop', key: 'replying' } as const, null as number | null)
// True once the snake's arrow-key Client faulted: the band then steers by its w/a/s/d buttons alone.
const snakeKeysFailed = atom({ plugin: 'agentmoop', key: 'snakeKeysFailed' } as const, false)
const status = atom({ plugin: 'agentmoop', key: 'status' } as const, null as string | null)

const POLL_MS = 20_000
const INLINE_ROWS = 5
const PANE_ROWS = 100
const TOO_MANY_MESSAGES = 'Too many messages right now. Try again later.'
const FRIENDS_WAIT_MS = 2000
// Composer: Enter at this terminal. Bridge: the person's own message through Remote Control. Every other
// origin (peers, channels, schedules, task notifications, the SDK) is not the person typing, so it passes.
const OWN_ORIGINS = new Set(['composer', 'bridge'])
const PASTED_IMAGE = "AgentMoop can't read pasted images. Drag the screenshot file into the prompt instead."

// "logan404 hey there" -> { tag: "logan404", body: "hey there" }; null when either part is missing.
export function parsePing(args: string): { tag: string; body: string } | null {
  const m = /^\s*@?([A-Za-z0-9_]{3,32})\s+([\s\S]*\S)\s*$/.exec(args)
  return m ? { tag: m[1]!.toLowerCase(), body: m[2]! } : null
}

// Each step runs whatever the one before it came to.
async function poll($: EngineInterface, session: Session) {
  await pollInbox($, session).catch(() => undefined)
  await refreshFriends($, session).catch(() => undefined)
  if (await read($, openFriend)) await loadConversation($, session).catch(() => undefined)
}

// Refreshes the friends, waiting at most `ms`: the prompt hook stays fast when the server is slow.
async function refreshWithin($: EngineInterface, session: Session, ms: number) {
  let cancel = () => {}
  const timeout = new Promise<void>(resolve => { const timer = $.clock.after(ms, resolve); cancel = () => timer.cancel() })
  await Promise.race([refreshFriends($, session).catch(() => undefined), timeout])
  cancel()
}

// Sends an @tag prompt in the background: the file (if any) first, then the message; the result shows in the band.
async function sendShare($: EngineInterface, session: Session, share: Share) {
  const call = (tool: string, args: Record<string, unknown>) => callAgentMoop($, session, tool, args)
  let attachmentId: string | undefined
  if (share.paths[0]) {
    const up = await uploadFile($, call, share.paths[0]).catch(() => ({ error: 'Upload failed.' }))
    if ('error' in up) { await flash($, session, `Not sent to @${share.tag}: ${up.error}`); return }
    attachmentId = up.attachmentId
  }
  const body = share.body || `Shared ${share.paths[0]!.split('/').pop()}`
  const res = await call('send_message', { to: share.tag, body, ...(attachmentId ? { attachment_id: attachmentId } : {}), client_message_id: crypto.randomUUID() })
  const limited = isRateLimited(res) ? `: ${TOO_MANY_MESSAGES}` : ''
  await flash($, session, 'text' in res ? `Sent to @${share.tag}.` : `Not sent to @${share.tag}${limited || '.'}`)
}

async function readHome($: EngineInterface) {
  try { return (await $.env.get('HOME')) ?? '' } catch { return '' }
}

// The one item the band shows, by precedence: friend cards, an open inline conversation, a game,
// then the friend line (with its play button while Claude works).
type Slot = 'cards' | 'inline' | 'game' | 'friends' | null
function bandSlot(s: { cards: number; inline: boolean; game: boolean; friends: number; playable: boolean }): Slot {
  if (s.cards > 0) return 'cards'
  if (s.inline) return 'inline'
  if (s.game) return 'game'
  return s.friends > 0 || s.playable ? 'friends' : null
}

// Drawing never writes state: what the band's props show changed (Claude stopped, a higher item came,
// the window narrowed) is written from a timer.
function followBand($: EngineInterface, games: GameRuntime, isWorking: boolean, g: Game | null, covered: boolean, columns: number) {
  const stopped = games.lastWorking && !isWorking
  games.lastWorking = isWorking
  games.working = isWorking
  if (!g || g.paused) return
  if (covered || boardTooWide(g, columns)) $.clock.after(0, () => { void pauseGame($, games, 'covered') })
  else if (stopped) $.clock.after(0, () => { void claudeDone($, games) })
}

export const register: Register = on => {
  const session = newSession()
  const games: GameRuntime = newGameRuntime()

  on('session.start', async ($, e, next) => {
    let running = false
    $.clock.every(POLL_MS, () => {
      if (running) return
      running = true
      poll($, session).catch(() => undefined).finally(() => { running = false })
    })
    if ((await $.store.get(COLLAPSED_KEY)) === true) await update($, collapsed, () => true)
    await loadGamesOff($)
    await $.command.register({ name: 'moop', description: 'Send an AgentMoop message without asking Claude.', argumentHint: '<tag> <message>', immediate: true })
    await $.command.register({ name: 'moop-games', description: 'Turn the AgentMoop play button on or off.', argumentHint: 'on|off', immediate: true })
    $.clock.after(0, () => { void refreshFriends($, session).catch(() => undefined) })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) games.working = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) { games.working = false; await claudeDone($, games) }
    return next(e)
  })

  // The arrow-key region failed to load or draw: leave it out and steer with w/a/s/d.
  on('ui.fault', { element: 'snake-keys' }, async $ => {
    await update($, snakeKeysFailed, () => true)
    return {}
  })

  on('ui.message', { element: 'snake-keys' }, async ($, e) => {
    const dir = (e.data as { dir?: unknown } | null)?.dir
    if (isDirection(dir)) await steer($, dir)
    return {}
  })

  on('command.run', { command: 'moop' }, async ($, e) => {
    const parsed = parsePing(e.args)
    if (!parsed) return { text: 'Usage: /moop <tag> <message>' }
    const ok = 'text' in (await callAgentMoop($, session, 'send_message', { to: parsed.tag, body: parsed.body, client_message_id: crypto.randomUUID() }))
    return { text: ok ? `Sent to @${parsed.tag}.` : `Not sent to @${parsed.tag}. Check the tag and that /mcp shows agentmoop connected.` }
  })

  on('command.run', { command: 'moop-games' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== 'on' && arg !== 'off') return { text: 'Usage: /moop-games on|off' }
    if (arg === 'off') { await turnOffGames($, games); return { text: 'Games off.' } }
    await update($, gamesOff, () => false)
    await $.store.set(GAMES_OFF_KEY, false)
    return { text: 'Games on.' }
  })

  // "@friend words [dragged file]" goes straight to the friend: dropped before the model, so no turn runs.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || !OWN_ORIGINS.has(e.origin?.kind) || !parseShare(e.text, '')) return next(e)
    const share = parseShare(e.text, await readHome($))!
    if (!session.friends.has(share.tag)) await refreshWithin($, session, FRIENDS_WAIT_MS)
    if (!session.friends.has(share.tag)) return next(e)
    if (e.attachments?.some(item => item.type === 'image')) return { drop: PASTED_IMAGE }
    if (share.paths.length > 1) return { drop: 'AgentMoop sends one file per message for now.' }
    if (!share.body && share.paths.length === 0) return { drop: `Add a message or a file after @${share.tag}.` }
    const problem = share.paths[0] ? await checkFile($, share.paths[0]) : null
    if (problem) return { drop: problem }
    // A timer outlives this dispatch, so a long upload never holds the prompt.
    $.clock.after(0, () => { void sendShare($, session, share).catch(() => undefined) })
    return { drop: `AgentMoop: sending to @${share.tag}...` }
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    await forgetConversation($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Text } = table
    const open = await read($, openFriend)
    const conv = await read($, conversation)
    // The pane is drawn after all (the terminal widened): the band's inline copy goes. Drawing never
    // writes state, so the write runs from a timer.
    if (await read($, paneInline)) $.clock.after(0, () => { void update($, paneInline, () => false) })
    if (!open) return <Text dimColor>Pick a friend in the agentmoop line.</Text>
    return conversationView($, table, session, open, conv, e.props.bodyColumns, PANE_ROWS, false)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, cards)
    const replyTo = await read($, replying)
    const note = await read($, status)
    const list = await read($, friends)
    const page = await read($, friendPage)
    const isCollapsed = await read($, collapsed)
    const open = await read($, openFriend)
    const inline = (await read($, paneInline)) && open
    const conv = await read($, conversation)
    const g = await read($, game)
    const playable = e.props.isWorking && !g && !isCollapsed && !(await read($, gamesOff))
    const keys = !(await read($, snakeKeysFailed))
    const columns = e.props.bodyColumns
    const slot = bandSlot({ cards: shown.length, inline: !!inline, game: !!g, friends: list.length, playable })
    followBand($, games, e.props.isWorking, g, slot === 'cards' || slot === 'inline', columns)
    if (e.props.hasSurvey || (!slot && !note)) return next(e)

    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const site = { surface: e.surface, table, columns, maxRows: e.props.maxRows, isWorking: e.props.isWorking, keys }
    const play = playable ? () => startGame($, games, site) : null
    return (
      <Box flexDirection="column">
        {slot === 'cards' ? cardList($, table, session, shown, replyTo) : null}
        {slot === 'inline' && list.length > 0 ? friendLine($, table, session, list, page, isCollapsed, columns, null) : null}
        {inline ? conversationView($, table, session, inline, conv, columns, INLINE_ROWS, true) : null}
        {slot === 'game' && g ? gameView($, games, g, site) : null}
        {slot === 'friends' ? friendLine($, table, session, list, page, isCollapsed, columns, play) : null}
        {note ? <Text dimColor>{note}</Text> : null}
      </Box>
    )
  })
}
