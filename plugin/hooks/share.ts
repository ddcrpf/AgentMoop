import type { EngineInterface } from 'claude-code'

import type { CallResult } from './client'

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain' }
export const MAX_BYTES = 10485760
export const CHUNK_BYTES = 131072
const LEAD = /^\s*@([A-Za-z0-9_]{3,32})(?=\s|$)([\s\S]*)$/
// At the start or after whitespace: a quoted path, or a bare one where "\x" escapes any character (what a
// terminal drop inserts). Only ASCII whitespace ends a bare path: macOS screenshot names hold U+202F.
const PATH = /(?<=^|\s)(?:'((?:~|\/)[^']+)'|"((?:~|\/)[^"]+)"|((?:~\/|\/)(?:\\[\s\S]|[^ \t\n\r\\])+))/g
// Sentence punctuation and closing marks after a bare path belong to the words, not the path.
const TRAILING = new Set([...'.,;:!?)]}>"\'', '\u2019', '\u201d'])
// The server's filename rules (src/attachments/store.ts): checked here so the prompt is refused at once.
const NAME_FORBIDDEN = /[\\/:\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\u061c\u180e\ufeff\u2044\u2215\uff0f]/
export const NAME_REFUSED = "AgentMoop can't send a file named like that. Rename it and try again."
// Stands where a path was taken out, so the space before it goes with it.
const MARK = '\x00'

export type Share = { tag: string; body: string; paths: string[] }

export function mediaTypeFor(path: string): string | null {
  return TYPES[path.split('.').pop()!.toLowerCase()] ?? null
}

const baseName = (path: string) => path.split('/').pop()!

function splitTrailing(bare: string): [string, string] {
  let end = bare.length
  while (end > 1 && TRAILING.has(bare[end - 1]!) && bare[end - 2] !== '\\') end--
  return [bare.slice(0, end), bare.slice(end)]
}

export function filenameProblem(path: string): string | null {
  const name = baseName(path).normalize('NFC')
  const bad = !name || name.length > 120 || NAME_FORBIDDEN.test(name) || name.startsWith('.') || /[. ]$/.test(name) || name.lastIndexOf('.') <= 0
  return bad ? NAME_REFUSED : null
}

// "@tag words /dragged/file.png" -> the tag, the words, and the absolute paths of supported files.
// A "~/" path stays text when the home directory is unknown.
export function parseShare(text: string, home: string): Share | null {
  const m = LEAD.exec(text)
  if (!m) return null
  const paths: string[] = []
  const body = m[2]!.replaceAll(MARK, ' ').replace(PATH, (whole, q1?: string, q2?: string, bare?: string) => {
    const [spelled, trail] = bare ? splitTrailing(bare) : [q1 ?? q2!, '']
    const raw = bare ? spelled.replace(/\\([\s\S])/g, '$1') : spelled
    if (raw.startsWith('~') && (!raw.startsWith('~/') || !home)) return whole
    const path = raw.startsWith('~/') ? home.replace(/\/$/, '') + raw.slice(1) : raw
    if (!mediaTypeFor(path)) return whole
    paths.push(path)
    return MARK + trail
  }).replace(/\s*\x00/g, '').replace(/\s+/g, ' ').trim()
  return { tag: m[1]!.toLowerCase(), body, paths }
}

export const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))
export function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

// Why the file can't be sent, or null: a name the server takes, a file, at most 10 MB.
export async function checkFile($: EngineInterface, path: string): Promise<string | null> {
  const badName = filenameProblem(path)
  if (badName) return badName
  const stat = await $.fs.stat(path).catch(() => null)
  if (!stat || stat.kind !== 'file') return `Can't find ${baseName(path)}.`
  return stat.size > MAX_BYTES ? 'That file is over 10 MB.' : null
}

export const TOO_MANY_FILES = 'Too many files right now. Try again later.'
export const isRateLimited = (res: CallResult) => 'failure' in res && res.failure === 'server' && res.error.trim() === 'RATE_LIMITED'
// What to tell the person when an upload step failed.
const uploadError = (res: CallResult, fallback: string) => ({ error: isRateLimited(res) ? TOO_MANY_FILES : fallback })

type Call = (tool: string, args: Record<string, unknown>) => Promise<CallResult>

// Reads exactly one file the person put in their prompt and uploads it in chunks; the path itself never leaves this machine.
export async function uploadFile($: EngineInterface, call: Call, path: string): Promise<{ attachmentId: string } | { error: string }> {
  const mediaType = mediaTypeFor(path)
  if (!mediaType) return { error: 'AgentMoop sends PNG, JPEG, WebP, Markdown or text files.' }
  const problem = await checkFile($, path)
  if (problem) return { error: problem }
  const read = await $.fs.read(path, { as: 'bytes' }).catch(() => null)
  if (!read) return { error: `Can't read ${baseName(path)}.` }
  const bytes = fromBase64(read.base64)
  if (bytes.length > MAX_BYTES) return { error: 'That file is over 10 MB.' }
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes))
  const start = await call('upload_start', { filename: baseName(path).normalize('NFC'), media_type: mediaType, size: bytes.length, sha256 })
  if (!('text' in start)) return uploadError(start, 'Upload failed.')
  const { upload_id } = JSON.parse(start.text) as { upload_id: string }
  for (let off = 0; off < bytes.length; off += CHUNK_BYTES) {
    const res = await call('upload_chunk', { upload_id, offset: off, data: toBase64(bytes.subarray(off, off + CHUNK_BYTES)) })
    if (!('text' in res)) return uploadError(res, 'Upload failed.')
  }
  const done = await call('upload_finish', { upload_id })
  if (!('text' in done)) return uploadError(done, 'AgentMoop refused that file.')
  return { attachmentId: (JSON.parse(done.text) as { attachment: { id: string } }).attachment.id }
}
