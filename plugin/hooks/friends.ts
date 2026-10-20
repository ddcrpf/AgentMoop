import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Conversation, Friend, OpenFriend, PingCard } from '../types'
import { callAgentMoop, flash, sendOnce } from './client'
import type { Session } from './client'
import { HANDLE, parseInbox } from './inbox'

// State is declared in each file that reads or writes it (the engine lists a module's state by its own consts).
const conversation = atom({ plugin: 'agentmoop', key: 'conversation' } as const, null as Conversation | null)
const friends = atom({ plugin: 'agentmoop', key: 'friends' } as const, [] as Friend[])
const openFriend = atom({ plugin: 'agentmoop', key: 'openFriend' } as const, null as OpenFriend | null)
// True when the conversation pane could not be placed, so the band shows it inline instead.
const paneInline = atom({ plugin: 'agentmoop', key: 'paneInline' } as const, false)

export const PANE_ID = 'agentmoop-conversation'
const KEEP_ROWS = 100
// What the friend line spends besides friends: "agentmoop", the page buttons and "hide", with their gaps.
const CONTROL_COLUMNS = 30
// A Button is drawn "[ label ]", then a gap.
const BUTTON_CHROME = 5

// list_contacts comes from a remote service: keep only well-formed friends.
export function parseContacts(text: string): Friend[] {
  const data = JSON.parse(text) as { contacts?: unknown }
  const rows = Array.isArray(data.contacts) ? data.contacts : []
  return rows.flatMap(row => {
    const { handle, conversationId, unread } = (row ?? {}) as Record<string, unknown>
    if (typeof handle !== 'string' || !HANDLE.test(handle)) return []
    return [{
      handle,
      conversationId: typeof conversationId === 'string' ? conversationId : null,
      unread: typeof unread === 'number' && Number.isInteger(unread) && unread > 0 ? unread : 0,
    }]
  })
}

export async function refreshFriends($: EngineInterface, session: Session) {
  const res = await callAgentMoop($, session, 'list_contacts', {})
  if (!('text' in res)) return
  let list: Friend[]
  try { list = parseContacts(res.text) } catch { return }
  session.friends = new Set(list.map(friend => friend.handle))
  await update($, friends, () => list)
  // A first message creates the conversation: carry its id to the open friend.
  await update($, openFriend, open => {
    const now = open && list.find(friend => friend.handle === open.handle)
    return open && now && now.conversationId !== open.conversationId ? { ...open, conversationId: now.conversationId } : open
  })
}

export const friendLabel = (friend: Friend) => `@${friend.handle}${friend.unread ? ` (${friend.unread})` : ''}`

// Splits the friends into pages, each as many as fit beside the line's own controls.
export function pageFriends(list: readonly Friend[], columns: number): Friend[][] {
  const room = Math.max(12, columns - CONTROL_COLUMNS)
  const pages: Friend[][] = []
  let page: Friend[] = []
  let used = 0
  for (const friend of list) {
    const width = friendLabel(friend).length + BUTTON_CHROME
    if (page.length > 0 && used + width > room) { pages.push(page); page = []; used = 0 }
    page.push(friend)
    used += width
  }
  if (page.length > 0) pages.push(page)
  return pages
}

function mergeRows(prior: readonly PingCard[], fresh: readonly PingCard[]) {
  const byId = new Map([...prior, ...fresh].map(row => [row.id, row]))
  return [...byId.values()].sort((a, b) => a.id - b.id).slice(-KEEP_ROWS)
}

// Loads the open friend's conversation: the newest rows after the last one seen, the latest 100 kept.
export async function loadConversation($: EngineInterface, session: Session) {
  const open = await read($, openFriend)
  const conversationId = open?.conversationId
  if (!conversationId) { await update($, conversation, () => null); return }
  const prior = await read($, conversation)
  let cursor = prior?.conversationId === conversationId ? prior.lastId : 0
  const fresh: PingCard[] = []
  let failed = false
  for (let pages = 0; pages < 50; pages++) {
    const res = await callAgentMoop($, session, 'read_conversation', { conversation_id: conversationId, after_id: cursor, limit: 100 })
    const page = 'text' in res ? parsePage(res.text) : null
    if (!page) { failed = true; break }
    fresh.push(...page.items)
    cursor = page.items.at(-1)?.id ?? cursor
    if (page.nextCursor === null) break
  }
  if ((await read($, openFriend))?.conversationId !== conversationId) return
  await update($, conversation, now => {
    const same = now?.conversationId === conversationId
    const rows = mergeRows(same ? now.rows : [], fresh)
    return { conversationId, rows, lastId: Math.max(cursor, same ? now.lastId : 0), failed }
  })
}

function parsePage(text: string) {
  try { return parseInbox(text) } catch { return null }
}

// Opens the friend's conversation in a pane, or inline under the band where no pane is drawn.
export async function openConversation($: EngineInterface, session: Session, friend: Friend) {
  await update($, openFriend, () => ({ handle: friend.handle, conversationId: friend.conversationId }))
  const opened = await $.ui.open({ id: PANE_ID, title: `@${friend.handle}`, closeOnEscape: true }).catch(() => null)
  await update($, paneInline, () => !opened?.isPlaced)
  await loadConversation($, session)
}

export async function forgetConversation($: EngineInterface) {
  await update($, openFriend, () => null)
  await update($, conversation, () => null)
  await update($, paneInline, () => false)
}

// Sends what the person typed into the conversation's field; no model turn.
export async function sendToFriend($: EngineInterface, session: Session, handle: string, text: string) {
  const res = await sendOnce(session, `friend:${handle}`, text, id => callAgentMoop($, session, 'send_message', { to: handle, body: text, client_message_id: id }))
  if (!res) return
  const ok = 'text' in res
  await flash($, session, ok ? `Sent to @${handle}.` : `Not sent to @${handle}.`)
  if (!ok) return
  session.sentCount += 1
  await refreshFriends($, session)
  await loadConversation($, session)
}
