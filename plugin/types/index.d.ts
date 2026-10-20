export type CardKind = 'text' | 'summary' | 'context'
// One message as the plugin shows it: `text` is the one-line preview, `body` the full text (display only).
export type PingCard = { id: number; from: string; text: string; kind: CardKind; body: string; attachmentName: string | null; sourceName: string | null }
export type Friend = { handle: string; conversationId: string | null; unread: number }
export type OpenFriend = { handle: string; conversationId: string | null }
// `failed`: the last load got no answer from the server.
export type Conversation = { conversationId: string; rows: PingCard[]; lastId: number; failed: boolean }
export type Direction = 'up' | 'down' | 'left' | 'right'
// [column, row] on the snake's grid.
export type Cell = [number, number]
export type SnakeGame = { kind: 'snake'; cols: number; rows: number; snake: Cell[]; dir: Direction; nextDir: Direction; food: Cell; score: number; best: number; over: boolean }
export type ReflexPhase = 'wait' | 'now' | 'result' | 'early'
export type ReflexGame = { kind: 'reflex'; phase: ReflexPhase; nowAt: number; ms: number | null; best: number | null }
// `paused`: why the game stopped its timers ('covered' by a higher item, or Claude is 'done'); null while playing.
export type Game = (SnakeGame | ReflexGame) & { paused: 'covered' | 'done' | null }

declare module 'claude-code' {
  interface PluginState {
    agentmoop: {
      cards: PingCard[]
      replying: number | null
      status: string | null
      friends: Friend[]
      friendPage: number
      collapsed: boolean
      openFriend: OpenFriend | null
      conversation: Conversation | null
      paneInline: boolean
      game: Game | null
      snakeKeysFailed: boolean
      gamesOff: boolean
    }
  }
}
