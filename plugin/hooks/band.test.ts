import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PREFIX = 'mcp__plugin_agentmoop_agentmoop__'
// The session already runs the same server under the user-scope name, so connect answers that name.
const SERVER = 'agentmoop'
// Claude idle, so the game offer (shown only while Claude works) stays out of these tests.
const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} } as const
const BAND = { plugin: 'agentmoop', component: 'AbovePrompt', props: BAND_PROPS } as const
const PANE = {
  plugin: 'agentmoop',
  component: 'Pane',
  requestId: 'agentmoop-conversation',
  props: { title: '@logan404', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const
const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const TYPED_PROMPT = { wait: false, origin: { kind: 'composer' } } as const
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const LOGAN = { id: 'u1', handle: 'logan404', conversationId: null, unread: 0 }
const PASTED_HINT = "AgentMoop can't read pasted images. Drag the screenshot file into the prompt instead."
type Row = { id: number; senderHandle: string; body: string; kind?: string; sourceName?: string; attachment?: { filename: string } }
type Contact = { id: string; handle: string; conversationId: string | null; unread: number }
type Sent = { tool: string; input: Record<string, unknown> }
type Fake = {
  inbox?: Row[]
  contacts?: Contact[]
  conversation?: Row[]
  modelPath?: string[]
  connected?: boolean
  // Makes the next writes fail: 'server' answers an error result, 'rate' the server's RATE_LIMITED,
  // 'transport' rejects the call.
  failures?: ('server' | 'rate' | 'transport')[]
  // Held before list_contacts answers (a slow server).
  contactsGate?: () => Promise<void>
  conversationFails?: boolean
}

// Stands in beneath the plugin: the remote AgentMoop server (answering $.mcp.call), and an engine whose
// AgentMoop tools all ask and whose tool.call path records anything that reaches it. Reads are answered
// from the fake's lists; every write lands in the returned `sent`.
function fakeAgentMoop(on: On, fake: Fake = {}) {
  const { inbox = [], contacts = [], conversation = [], modelPath = [], connected = true, failures = [], contactsGate, conversationFails = false } = fake
  const sent: Sent[] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => h($.ui.resolve(e).Box, {}) as RenderElement)
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', (_$, e) => { modelPath.push(String(e.tool)); return { deny: 'not in this test' } })
  on('mcp.connect', (_$, e) => ({
    value: connected && e.server === 'agentmoop'
      ? { isConnected: true, server: SERVER }
      : { isConnected: false, reason: 'auth', message: 'agentmoop needs authentication.' },
  }))
  on('mcp.call', async (_$, e) => {
    const text = (s: unknown) => ({ value: { content: [{ type: 'text', text: JSON.stringify(s) }], isError: false } })
    if (e.server !== SERVER) return { value: { content: [{ type: 'text', text: 'no such server' }], isError: true } }
    const after = Number(e.args.after_id ?? 0)
    if (e.tool === 'list_inbox') return text({ items: inbox.filter(m => m.id > after), nextCursor: null })
    if (e.tool === 'list_contacts') { await contactsGate?.(); return text({ contacts }) }
    if (e.tool === 'read_conversation' && conversationFails) return { value: { content: [{ type: 'text', text: 'NOT_FOUND' }], isError: true } }
    if (e.tool === 'read_conversation') return text({ items: conversation.filter(m => m.id > after), nextCursor: null })
    sent.push({ tool: e.tool, input: e.args })
    const failure = failures.shift()
    if (failure === 'server') return { value: { content: [{ type: 'text', text: 'IDEMPOTENCY_CONFLICT' }], isError: true } }
    if (failure === 'rate') return { value: { content: [{ type: 'text', text: 'RATE_LIMITED' }], isError: true } }
    if (failure === 'transport') return { deny: 'connection reset' }
    if (e.tool === 'upload_start') return text({ upload_id: '6f1c2a52-6a8e-4c43-9a35-0d6c1f4f3a10', chunk_bytes: 131072 })
    if (e.tool === 'upload_chunk') return text({ received: Number(e.args.offset) + atob(String(e.args.data)).length })
    if (e.tool === 'upload_finish') return text({ attachment: { id: 'att-1', filename: 'shot.png' } })
    return text({ status: 'accepted' })
  })
  return sent
}

// Stands in beneath the prompt: records what reached the model path (a turn) and what passed every plugin.
function fakePrompt(on: On) {
  const passed: string[] = []
  const turns: string[] = []
  on('prompt.submit', (_$, e) => { passed.push(e.text); return { text: e.text } })
  on('turn.start', (_$, e, next) => { turns.push('turn'); return next(e) })
  return { passed, turns }
}

// Stands in for the file system beneath the plugin, recording every path asked about.
function fakeFiles(on: On, files: Record<string, string>, sizes: Record<string, number> = {}) {
  const asked: string[] = []
  on('fs.stat', (_$, e) => {
    asked.push(e.path)
    const data = files[e.path]
    if (data === undefined) return { deny: 'ENOENT' }
    return { value: { kind: 'file', size: sizes[e.path] ?? atob(data).length, mtimeMs: 0, isLink: false } }
  })
  on('fs.read', (_$, e) => {
    asked.push(e.path)
    const data = files[e.path]
    return data === undefined ? { deny: 'ENOENT' } : { value: { base64: data } }
  })
  return asked
}

function pngBase64(size: number) {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return btoa(String.fromCharCode(...bytes))
}

// The upload hashes with crypto.subtle, which settles outside the mocked clock: settle until the sends land.
async function settleUntil(clock: { settle: () => Promise<void> }, done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) {
    await clock.settle()
    await crypto.subtle.digest('SHA-256', new Uint8Array(1))
  }
  await clock.settle()
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

test('shows new messages, replies in the card without the model, and never sends unasked', async ($, on) => {
  const clock = mock.clock(on); mock.store(on)
  const inbox: Row[] = [{ id: 1, senderHandle: 'logan404', body: 'old' }]; const modelPath: string[] = []
  const sent = fakeAgentMoop(on, { inbox, modelPath })
  await $.session.start(START)
  await clock.advance(20_000)
  inbox.push({ id: 2, senderHandle: 'logan404', body: 'free tonight?' })
  await clock.advance(20_000)
  expect(sent).toEqual([])
  expect(sent.some(call => call.tool.startsWith('sponsored_'))).toBe(false)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /old/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /free tonight\?/ })).toBeDefined()
  expect(await ui.find({ key: 'add-2' })).toBeUndefined()
  await ui.press({ key: 'reply-2' })
  await ui.input({ key: 'input-2', text: 'yes, 9pm' })
  expect(sent).toHaveLength(1)
  expect(sent[0]!.tool).toBe('reply')
  expect(sent[0]!.input).toMatchObject({ message_id: 2, body: 'yes, 9pm', client_message_id: expect.any(String) })
  expect(await ui.find({ type: 'Text', text: /Sent to @logan404/ })).toBeDefined()
  expect(modelPath).toEqual([])
  await ui.unmount()
})

test('/moop sends to a tag and explains bad input', async ($, on) => {
  mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  const sent = fakeAgentMoop(on)
  await $.session.start(START)
  expect((await $.command.run({ ...TYPED, command: 'moop', args: '@Logan404 hey there' })).text).toBe('Sent to @logan404.')
  expect(sent[0]).toMatchObject({ tool: 'send_message', input: { to: 'logan404', body: 'hey there' } })
  expect((await $.command.run({ ...TYPED, command: 'moop', args: 'logan404' })).text).toBe('Usage: /moop <tag> <message>')
  expect(sent).toHaveLength(1)
})

test("leaves the model's own AgentMoop sends to the normal permission flow", async ($, on) => {
  mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  const sent = fakeAgentMoop(on)
  await $.session.start(START)
  // The test's `$` is the engine's own, so these checks carry origin "engine", as a model call does.
  for (const tool of [PREFIX + 'reply', PREFIX + 'send_message', PREFIX + 'list_inbox']) {
    const { decision } = await $.tool.check({ tool, input: { message_id: 2, body: 'sure' } })
    expect(decision).toBe('ask')
  }
  expect(sent).toEqual([])
})

test('asks once to sign in when the server is not connected, and shows or sends nothing', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  const sent = fakeAgentMoop(on, { inbox: [{ id: 3, senderHandle: 'logan404', body: 'hidden' }], contacts: [LOGAN], connected: false })
  await $.session.start(START)
  await clock.advance(60_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /sign in with \/mcp/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /hidden/ })).toBeUndefined()
  expect(await ui.find({ key: 'friend-logan404' })).toBeUndefined()
  await ui.unmount()
  expect((await $.command.run({ ...TYPED, command: 'moop', args: 'logan404 hi' })).text).toMatch(/^Not sent/)
  expect(sent).toEqual([])
})

test('drops inbox rows whose sender is not a valid tag', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  fakeAgentMoop(on, { inbox: [{ id: 4, senderHandle: 'Bad Tag!', body: 'spoof' }, { id: 5, senderHandle: 'logan404', body: 'real' }] })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /spoof/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /real/ })).toBeDefined()
  await ui.unmount()
})

test('reuses a reply id only for the same text after a transport failure', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  const sent = fakeAgentMoop(on, { inbox: [{ id: 7, senderHandle: 'logan404', body: 'there?' }], failures: ['server', 'transport'] })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'reply-7' })
  await ui.input({ key: 'input-7', text: 'yes' })
  await ui.input({ key: 'input-7', text: 'yes, 9pm' })
  await ui.input({ key: 'input-7', text: 'yes, 9pm' })
  const ids = sent.map(s => s.input.client_message_id)
  expect(sent.map(s => s.input.body)).toEqual(['yes', 'yes, 9pm', 'yes, 9pm'])
  expect(ids[1]).not.toBe(ids[0])
  expect(ids[2]).toBe(ids[1])
  expect(await ui.find({ type: 'Text', text: /Sent to @logan404/ })).toBeDefined()
  await ui.unmount()
})

test('@friend text is sent at once with no model turn', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 }); mock.env(on, { HOME: '/Users/p' })
  const sent = fakeAgentMoop(on, { contacts: [LOGAN] })
  const prompt = fakePrompt(on)
  await $.session.start(START)
  const res = await $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404 check this out' })
  expect(res.drop).toBe('AgentMoop: sending to @logan404...')
  await clock.settle()
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ tool: 'send_message', input: { to: 'logan404', body: 'check this out', client_message_id: expect.any(String) } })
  expect(prompt.passed).toEqual([])
  expect(prompt.turns).toEqual([])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Sent to @logan404\./ })).toBeDefined()
  await ui.unmount()
})

test('@friend with a dragged file uploads it in chunks and sends it; the path stays local', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 }); mock.env(on, { HOME: '/Users/p' })
  const sent = fakeAgentMoop(on, { contacts: [LOGAN] })
  const prompt = fakePrompt(on)
  const png = pngBase64(72)
  const asked = fakeFiles(on, { '/tmp/shot.png': png })
  await $.session.start(START)
  const res = await $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404 look /tmp/shot.png' })
  expect(res.drop).toBeDefined()
  await settleUntil(clock, () => sent.some(s => s.tool === 'send_message'))
  const digest = hex(await crypto.subtle.digest('SHA-256', Uint8Array.from(atob(png), c => c.charCodeAt(0))))
  expect(sent.map(s => s.tool)).toEqual(['upload_start', 'upload_chunk', 'upload_finish', 'send_message'])
  expect(sent[0]!.input).toEqual({ filename: 'shot.png', media_type: 'image/png', size: 72, sha256: digest })
  expect(sent[1]!.input).toEqual({ upload_id: '6f1c2a52-6a8e-4c43-9a35-0d6c1f4f3a10', offset: 0, data: png })
  expect(sent[2]!.input).toEqual({ upload_id: '6f1c2a52-6a8e-4c43-9a35-0d6c1f4f3a10' })
  expect(sent[3]!.input).toMatchObject({ to: 'logan404', body: 'look', attachment_id: 'att-1' })
  expect(JSON.stringify(sent)).not.toContain('/tmp')
  expect(asked.every(path => path === '/tmp/shot.png')).toBe(true)
  expect(prompt.passed).toEqual([])
  expect(prompt.turns).toEqual([])
})

test('a prompt to someone who is not a friend goes to the model unchanged', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 }); mock.env(on, { HOME: '/Users/p' })
  const sent = fakeAgentMoop(on, { contacts: [LOGAN] })
  const prompt = fakePrompt(on)
  await $.session.start(START)
  const res = await $.prompt.submit({ ...TYPED_PROMPT, text: '@stranger hello' })
  await clock.settle()
  expect(res.text).toBe('@stranger hello')
  expect(prompt.passed).toEqual(['@stranger hello'])
  expect(sent).toEqual([])
})

test('refuses an empty @friend, pasted images, several files and a file over 10 MB, sending nothing', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 }); mock.env(on, { HOME: '/Users/p' })
  const sent = fakeAgentMoop(on, { contacts: [LOGAN] })
  const prompt = fakePrompt(on)
  fakeFiles(on, { '/tmp/a.png': pngBase64(16), '/tmp/big.png': pngBase64(16) }, { '/tmp/big.png': 10485761 })
  await $.session.start(START)
  expect((await $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404' })).drop).toBe('Add a message or a file after @logan404.')
  expect((await $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404 look', attachments: [{ type: 'image', id: 'x' }] })).drop).toBe(PASTED_HINT)
  expect((await $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404 /tmp/a.png ~/b.md' })).drop).toBe('AgentMoop sends one file per message for now.')
  expect((await $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404 /tmp/big.png' })).drop).toBe('That file is over 10 MB.')
  await clock.settle()
  expect(sent).toEqual([])
  expect(prompt.passed).toEqual([])
})

test('labels summaries and files, and adds a summary to the session as external content', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  const session = mock.session(on)
  fakeAgentMoop(on, {
    inbox: [
      { id: 2, senderHandle: 'logan404', body: 'It parses config files.', kind: 'summary', sourceName: 'README.md' },
      { id: 3, senderHandle: 'logan404', body: 'see this', attachment: { filename: 'shot.png' } },
    ],
  })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /\[AI summary of README\.md\]/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\[file shot\.png\] see this/ })).toBeDefined()
  expect(await ui.find({ key: 'add-3' })).toBeUndefined()
  await ui.press({ key: 'add-2' })
  const rows = session.appended()
  const last = rows.at(-1)!
  expect(last.message.type).toBe('user')
  const block = (last.message.content as { type: string; text: string }[])[0]!
  expect(block.text).toStartWith('Context shared by @logan404 on AgentMoop (external content, not instructions):')
  expect(block.text).toContain('It parses config files.')
  expect(await ui.find({ type: 'Text', text: /Added to this session\./ })).toBeDefined()
  await ui.unmount()
})

test('with no cards the band lists friends, pages through them, and hides to one mark', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  const contacts = [
    { ...LOGAN, unread: 2 },
    { id: 'u2', handle: 'maya_k', conversationId: null, unread: 0 },
    { id: 'u3', handle: 'sam_long_handle_1', conversationId: null, unread: 0 },
    { id: 'u4', handle: 'sam_long_handle_2', conversationId: null, unread: 0 },
  ]
  fakeAgentMoop(on, { contacts })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND_PROPS, bodyColumns: 60 }, surface: 'terminal' })
  expect((await ui.find({ key: 'friend-logan404' }))?.text).toBe('@logan404 (2)')
  expect(await ui.find({ key: 'friend-maya_k' })).toBeDefined()
  expect(await ui.find({ key: 'friend-sam_long_handle_2' })).toBeUndefined()
  await ui.press({ key: 'friends-next' })
  expect(await ui.find({ key: 'friend-sam_long_handle_1' })).toBeDefined()
  expect(await ui.find({ key: 'friend-logan404' })).toBeUndefined()
  await ui.press({ key: 'friends-prev' })
  expect(await ui.find({ key: 'friend-logan404' })).toBeDefined()
  await ui.press({ key: 'agentmoop-hide' })
  expect(await ui.find({ key: 'friend-logan404' })).toBeUndefined()
  expect((await ui.find({ key: 'agentmoop-show' }))?.text).toBe('agentmoop ●')
  await ui.press({ key: 'agentmoop-show' })
  expect(await ui.find({ key: 'friend-maya_k' })).toBeDefined()
  await ui.unmount()
})

test('with six friends on a 60-column terminal the friend line pages its friends so the label, next and hide buttons fit', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  const contacts = ['annie', 'benny', 'cathy', 'danny', 'evieb', 'faith'].map((handle, i) => ({ id: `u${i}`, handle, conversationId: null, unread: 0 }))
  fakeAgentMoop(on, { contacts })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND_PROPS, bodyColumns: 60 }, surface: 'terminal' })
  // Each button is 11 columns: two fit beside the 30 columns of controls, a third (33) would only fit if they took 27.
  expect(await ui.find({ text: 'agentmoop' })).toBeDefined()
  expect(await ui.find({ key: 'friend-benny' })).toBeDefined()
  expect(await ui.find({ key: 'friend-cathy' })).toBeUndefined()
  expect(await ui.find({ key: 'friends-next' })).toBeDefined()
  expect(await ui.find({ key: 'agentmoop-hide' })).toBeDefined()
  await ui.unmount()
})

test('a friend opens a conversation pane that lists the conversation and sends from its field', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  const opened: unknown[] = []
  on('ui.open', (_$, e) => { opened.push(e); return { value: { isPlaced: true } } })
  const sent = fakeAgentMoop(on, {
    contacts: [{ ...LOGAN, conversationId: 'c1' }],
    conversation: [
      { id: 1, senderHandle: 'logan404', body: 'hi there' },
      { id: 2, senderHandle: 'me_user', body: 'look', attachment: { filename: 'shot.png' } },
    ],
  })
  await $.session.start(START)
  await clock.advance(20_000)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'friend-logan404' })
  expect(opened).toEqual([expect.objectContaining({ id: 'agentmoop-conversation', title: '@logan404' })])
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: /@logan404:.*hi there/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /you:.*\[file shot\.png\] look/ })).toBeDefined()
  const field = await pane.find({ type: 'Input' })
  expect(field?.props.label).toBe('Message @logan404')
  await pane.input({ key: field!.key!, text: 'see you at 9' })
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ tool: 'send_message', input: { to: 'logan404', body: 'see you at 9', client_message_id: expect.any(String) } })
  await pane.unmount()
  await band.unmount()
})

test('a friend with no conversation, where no pane is drawn, opens inline under the band', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'no surface places panes' } }))
  on('ui.close', () => ({ value: undefined }))
  const sent = fakeAgentMoop(on, { contacts: [LOGAN] })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'friend-logan404' })
  expect(await ui.find({ type: 'Text', text: /No messages yet\. Say hi below\./ })).toBeDefined()
  const field = await ui.find({ type: 'Input' })
  await ui.input({ key: field!.key!, text: 'hey' })
  expect(sent[0]).toMatchObject({ tool: 'send_message', input: { to: 'logan404', body: 'hey' } })
  await ui.press({ key: 'conv-close' })
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  await ui.unmount()
})

test('only the person typing at the prompt sends: peer, channel, command and hidden prompts pass untouched', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 }); mock.env(on, { HOME: '/Users/p' })
  const sent = fakeAgentMoop(on, { contacts: [LOGAN] })
  const prompt = fakePrompt(on)
  const asked = fakeFiles(on, { '/Users/p/notes.md': btoa('# notes') })
  await $.session.start(START)
  const text = '@logan404 ~/notes.md'
  for (const origin of [{ kind: 'peer' }, { kind: 'channel', server: 'slack' }] as const) {
    expect((await $.prompt.submit({ wait: false, origin, text })).text).toBe(text)
  }
  expect((await $.prompt.submit({ ...TYPED_PROMPT, text, isMeta: true })).text).toBe(text)
  expect((await $.prompt.submit({ ...TYPED_PROMPT, text, command: { name: 'review', args: '' } })).text).toBe(text)
  await clock.settle()
  expect(prompt.passed).toEqual([text, text, text, text])
  expect(asked).toEqual([])
  expect(sent).toEqual([])
})

test('a file over one chunk is uploaded in 131072-byte pieces; a file alone gets a default body', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 }); mock.env(on, { HOME: '/Users/p' })
  const sent = fakeAgentMoop(on, { contacts: [LOGAN] })
  fakePrompt(on)
  fakeFiles(on, { '/tmp/big shot.png': pngBase64(131072 + 100) })
  await $.session.start(START)
  await $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404 /tmp/big\\ shot.png' })
  await settleUntil(clock, () => sent.some(s => s.tool === 'send_message'))
  const chunks = sent.filter(s => s.tool === 'upload_chunk')
  expect(chunks.map(c => c.input.offset)).toEqual([0, 131072])
  expect(chunks.map(c => atob(String(c.input.data)).length)).toEqual([131072, 100])
  expect(sent.at(-1)).toMatchObject({ tool: 'send_message', input: { body: 'Shared big shot.png', attachment_id: 'att-1' } })
})

test('a rate-limited upload says so and sends nothing', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 }); mock.env(on, { HOME: '/Users/p' })
  const sent = fakeAgentMoop(on, { contacts: [LOGAN], failures: ['rate'] })
  fakePrompt(on)
  fakeFiles(on, { '/tmp/shot.png': pngBase64(72) })
  await $.session.start(START)
  const res = await $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404 /tmp/shot.png' })
  expect(res.drop).toBeDefined()
  await settleUntil(clock, () => sent.length > 0)
  expect(sent.map(s => s.tool)).toEqual(['upload_start'])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Not sent to @logan404: Too many files right now\. Try again later\./ })).toBeDefined()
  await ui.unmount()
})

test('a badly named file is refused before anything is read', async ($, on) => {
  mock.clock(on); mock.store(on, { lastSeenMessageId: 0 }); mock.env(on, { HOME: '/Users/p' })
  const sent = fakeAgentMoop(on, { contacts: [LOGAN] })
  fakePrompt(on)
  const asked = fakeFiles(on, { '/tmp/.shot.png': pngBase64(72) })
  await $.session.start(START)
  const res = await $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404 /tmp/.shot.png' })
  expect(res.drop).toBe("AgentMoop can't send a file named like that. Rename it and try again.")
  expect(asked).toEqual([])
  expect(sent).toEqual([])
})

test('a slow friends refresh lets the prompt through after two seconds', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 }); mock.env(on, { HOME: '/Users/p' })
  const sent = fakeAgentMoop(on, { contacts: [LOGAN], contactsGate: () => clock.sleep(10_000) })
  const prompt = fakePrompt(on)
  await $.session.start(START)
  const pending = $.prompt.submit({ ...TYPED_PROMPT, text: '@logan404 hi' })
  await clock.advance(2000)
  expect((await pending).text).toBe('@logan404 hi')
  expect(prompt.passed).toEqual(['@logan404 hi'])
  expect(sent).toEqual([])
})

test('the collapsed band is restored from the store', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0, bandCollapsed: true })
  fakeAgentMoop(on, { contacts: [LOGAN] })
  await $.session.start(START)
  await clock.advance(20_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'agentmoop-show' }))?.text).toBe('agentmoop')
  expect(await ui.find({ key: 'friend-logan404' })).toBeUndefined()
  await ui.unmount()
})

test('the pane says when messages could not be loaded, and a drawn pane replaces the inline copy', async ($, on) => {
  const clock = mock.clock(on); mock.store(on, { lastSeenMessageId: 0 })
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'narrow terminal' } }))
  fakeAgentMoop(on, { contacts: [{ ...LOGAN, conversationId: 'c1' }], conversationFails: true })
  await $.session.start(START)
  await clock.advance(20_000)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await band.press({ key: 'friend-logan404' })
  expect(await band.find({ type: 'Text', text: /Couldn't load messages\./ })).toBeDefined()
  expect(await band.find({ type: 'Input' })).toBeDefined()
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: /Couldn't load messages\./ })).toBeDefined()
  await clock.settle()
  expect(await band.find({ type: 'Input' })).toBeUndefined()
  await pane.unmount()
  await band.unmount()
})
