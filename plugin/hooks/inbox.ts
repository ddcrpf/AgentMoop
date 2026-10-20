import { atom, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { CardKind, PingCard } from '../types'
import { callAgentMoop } from './client'
import type { Session } from './client'

// State is declared in each file that reads or writes it (the engine lists a module's state by its own consts).
const cards = atom({ plugin: 'agentmoop', key: 'cards' } as const, [] as PingCard[])

export const HANDLE = /^[a-z0-9_]{3,32}$/
const MAX_CARDS = 3
const PREVIEW_CHARS = 240
const BODY_CHARS = 16_000
const LAST_SEEN_KEY = 'lastSeenMessageId'
const KINDS: readonly CardKind[] = ['text', 'summary', 'context']
// Control, bidi and zero-width characters a remote sender could use to disturb the terminal or hide text.
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u061c\u180e\ufeff]/g

export type InboxPage = { items: PingCard[]; nextCursor: number | null }

export function clean(text: string) {
  return text.replace(UNSAFE, ' ')
}

export function clip(text: string, chars: number) {
  const flat = clean(text).replace(/\s+/g, ' ').trim()
  return flat.length > chars ? flat.slice(0, chars - 1) + '…' : flat
}

const optionalName = (value: unknown) => (typeof value === 'string' && value ? clip(value, 120) : null)

function parseItem(row: unknown): PingCard | null {
  const { id, senderHandle, body, kind, sourceName, attachment } = (row ?? {}) as Record<string, unknown>
  if (typeof id !== 'number' || typeof senderHandle !== 'string' || !HANDLE.test(senderHandle) || typeof body !== 'string') return null
  const file = attachment && typeof attachment === 'object' ? (attachment as Record<string, unknown>).filename : undefined
  return {
    id,
    from: senderHandle,
    text: clip(body, PREVIEW_CHARS),
    kind: KINDS.includes(kind as CardKind) ? (kind as CardKind) : 'text',
    body: clean(body).slice(0, BODY_CHARS),
    attachmentName: optionalName(file),
    sourceName: optionalName(sourceName),
  }
}

// Inbox and conversation pages come from a remote service: keep only well-formed rows.
export function parseInbox(text: string): InboxPage {
  const data = JSON.parse(text) as { items?: unknown; nextCursor?: unknown }
  const rows = Array.isArray(data.items) ? data.items : []
  const items = rows.flatMap(row => parseItem(row) ?? [])
  return { items, nextCursor: typeof data.nextCursor === 'number' ? data.nextCursor : null }
}

// The marks that tell a file, a generated summary and a context packet apart from a typed message.
export function labelOf(card: PingCard): string {
  const kind = card.kind === 'summary' ? `[AI summary of ${card.sourceName ?? 'a file'}] ` : card.kind === 'context' ? '[shared context] ' : ''
  return kind + (card.attachmentName ? `[file ${card.attachmentName}] ` : '')
}

async function fetchInbox($: EngineInterface, session: Session, afterId: number, limit: number): Promise<InboxPage | null> {
  const res = await callAgentMoop($, session, 'list_inbox', { after_id: afterId, limit })
  return 'text' in res && res.text ? parseInbox(res.text) : null
}

// First run: mark everything already in the inbox as seen, so old messages don't pop up.
async function baseline($: EngineInterface, session: Session): Promise<number | null> {
  let cursor = 0
  for (let pages = 0; pages < 50; pages++) {
    const page = await fetchInbox($, session, cursor, 100)
    if (!page) return null
    cursor = page.items.at(-1)?.id ?? cursor
    if (page.nextCursor === null) return cursor
  }
  return cursor
}

export async function pollInbox($: EngineInterface, session: Session) {
  const stored = await $.store.get(LAST_SEEN_KEY)
  if (typeof stored !== 'number') {
    const seen = await baseline($, session)
    if (seen !== null) await $.store.set(LAST_SEEN_KEY, seen)
    return
  }
  const page = await fetchInbox($, session, stored, 30)
  if (!page || page.items.length === 0) return
  await $.store.set(LAST_SEEN_KEY, page.items.at(-1)!.id)
  await update($, cards, list => [...list, ...page.items].slice(-MAX_CARDS))
}
