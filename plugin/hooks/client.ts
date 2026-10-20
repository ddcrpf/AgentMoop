import { atom, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

// State is declared in each file that reads or writes it (the engine lists a module's state by its own consts).
const status = atom({ plugin: 'agentmoop', key: 'status' } as const, null as string | null)

// The server's key in .mcp.json; $.mcp.connect answers the name the session runs it under.
const MANIFEST_SERVER = 'agentmoop'
const STATUS_MS = 4000
const SIGN_IN_NOTE = 'AgentMoop: sign in with /mcp -> agentmoop to see messages here.'

// What a direct call came to: the server's text, its error answer (with its error code), or no answer at
// all (not connected, call threw).
export type CallResult = { text: string } | { failure: 'server'; error: string } | { failure: 'transport' }
// A send not yet confirmed: its id is reused only for the same text after a transport failure.
type PendingSend = { text: string; id: string }
// Per-session connection and send bookkeeping, kept in register's closure.
export type Session = {
  server: string | null
  warned: boolean
  statusTimer: Timer | null
  sending: Set<string>
  pending: Map<string, PendingSend>
  friends: Set<string>
  sentCount: number
}

export function newSession(): Session {
  return { server: null, warned: false, statusTimer: null, sending: new Set(), pending: new Map(), friends: new Set(), sentCount: 0 }
}

// The server's name for $.mcp.call, connecting on first use; null (and a one-time sign-in note) when not connected.
async function resolveServer($: EngineInterface, session: Session): Promise<string | null> {
  if (session.server) return session.server
  const res = await $.mcp.connect(MANIFEST_SERVER)
  if (res.isConnected) {
    session.server = res.server
    if (session.warned) { session.warned = false; await update($, status, () => null) }
    return res.server
  }
  if (!session.warned) { session.warned = true; await update($, status, () => SIGN_IN_NOTE) }
  return null
}

// Calls the server directly ($.mcp.call): the plugin's own call, so no dialog and nothing reaches the model.
export async function callAgentMoop($: EngineInterface, session: Session, tool: string, args: Record<string, unknown>): Promise<CallResult> {
  const server = await resolveServer($, session)
  if (!server) return { failure: 'transport' }
  try {
    const res = await $.mcp.call(server, tool, args)
    const text = res.content.map(block => block.text ?? '').join('')
    return res.isError ? { failure: 'server', error: text } : { text }
  } catch {
    session.server = null
    return { failure: 'transport' }
  }
}

// Calls a tool that answers a picture: the base64 of its first PNG block, or null.
export async function callAgentMoopImage($: EngineInterface, session: Session, tool: string, args: Record<string, unknown>): Promise<string | null> {
  const server = await resolveServer($, session)
  if (!server) return null
  try {
    const res = await $.mcp.call(server, tool, args)
    if (res.isError) return null
    const block = res.content.find(item => item.type === 'image' && item.mimeType === 'image/png')
    return typeof block?.data === 'string' ? block.data : null
  } catch {
    session.server = null
    return null
  }
}

// One send per key at a time. The server refuses a reused client_message_id with other content, so the
// pending id is reused only for identical text, and kept only when the call never got a server answer.
// Null when nothing was sent (empty text, or a send for this key still in flight).
export async function sendOnce(session: Session, key: string, text: string, send: (clientMessageId: string) => Promise<CallResult>): Promise<CallResult | null> {
  if (!text.trim() || session.sending.has(key)) return null
  session.sending.add(key)
  const prior = session.pending.get(key)
  const id = prior && prior.text === text ? prior.id : crypto.randomUUID()
  session.pending.set(key, { text, id })
  try {
    const res = await send(id)
    if ('text' in res || res.failure === 'server') session.pending.delete(key)
    return res
  } finally {
    session.sending.delete(key)
  }
}

// Shows a short-lived note in the band; a newer note replaces the older one and its timer.
export async function flash($: EngineInterface, session: Session, note: string) {
  session.statusTimer?.cancel()
  await update($, status, () => note)
  session.statusTimer = $.clock.after(STATUS_MS, () => { session.statusTimer = null; void update($, status, () => null) })
}
