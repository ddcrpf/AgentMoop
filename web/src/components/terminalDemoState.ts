export type Friend = 'maya' | 'kai';
export type Person = 'you' | Friend;
export type DemoLine = { id: number; kind: 'prompt' | 'sent' | 'claude'; text: string };
export type DemoCard = { id: number; from: Person; to: Person; body: string; answered: boolean };
export type DemoState = {
  draft: string;
  lines: DemoLine[];
  cards: DemoCard[];
  dismissedIds: number[];
  replyToId: number | null;
  nextId: number;
};
export type DemoAction =
  | { type: 'draft'; value: string }
  | { type: 'send' }
  | { type: 'prefill'; friend: Friend }
  | { type: 'reply'; id: number }
  | { type: 'dismiss'; id: number }
  | { type: 'deliver'; id: number }
  | { type: 'reset' };

export const claudeAnswer = "I can look into that. If you want a teammate's eyes, type @maya and your question — AgentMoop sends it to her terminal.";
export const friendReplies: Record<Friend, string> = {
  maya: 'On it. The token check skips expired sessions — looking now.',
  kai: 'Seen it. I will take a look after this build.',
};
export const REPLY_DELAY_MS = 1200;
const MAX_LINES = 6;

export function createDemoState(): DemoState {
  return { draft: '', lines: [], cards: [], dismissedIds: [], replyToId: null, nextId: 1 };
}

export function cardsFor(state: DemoState, person: Person): DemoCard[] {
  return state.cards.filter(card => card.to === person && !state.dismissedIds.includes(card.id));
}

function parseMoop(draft: string): { to: Friend; body: string } | null {
  const match = /^\s*@(maya|kai)\s+([\s\S]*\S)\s*$/i.exec(draft);
  return match ? { to: match[1]!.toLowerCase() as Friend, body: match[2]! } : null;
}

function addLines(state: DemoState, lines: Omit<DemoLine, 'id'>[]): DemoState {
  const added = lines.map((line, i) => ({ ...line, id: state.nextId + i }));
  return { ...state, lines: [...state.lines, ...added].slice(-MAX_LINES), nextId: state.nextId + added.length };
}

function sendMoop(state: DemoState, to: Friend, body: string): DemoState {
  const next = addLines(state, [{ kind: 'sent', text: `Sent to @${to}` }]);
  const card: DemoCard = { id: next.nextId, from: 'you', to, body, answered: false };
  const dismissedIds = state.replyToId === null ? state.dismissedIds : [...state.dismissedIds, state.replyToId];
  return { ...next, cards: [...next.cards, card], dismissedIds, replyToId: null, draft: '', nextId: next.nextId + 1 };
}

function deliverReply(state: DemoState, id: number): DemoState {
  const original = state.cards.find(card => card.id === id);
  if (!original || original.from !== 'you' || original.to === 'you' || original.answered) return state;
  const reply: DemoCard = { id: state.nextId, from: original.to, to: 'you', body: friendReplies[original.to], answered: true };
  const cards = state.cards.map(card => card.id === id ? { ...card, answered: true } : card);
  return { ...state, cards: [...cards, reply], nextId: state.nextId + 1 };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'reset': return createDemoState();
    case 'draft': return { ...state, draft: action.value };
    case 'prefill': return { ...state, draft: `@${action.friend} ` };
    case 'dismiss': return { ...state, dismissedIds: [...state.dismissedIds, action.id], replyToId: state.replyToId === action.id ? null : state.replyToId };
    case 'deliver': return deliverReply(state, action.id);
    case 'reply': {
      const card = state.cards.find(item => item.id === action.id && item.to === 'you');
      return card ? { ...state, draft: `@${card.from} `, replyToId: card.id } : state;
    }
    case 'send': {
      const text = state.draft.trim();
      if (!text) return state;
      const moop = parseMoop(text);
      if (moop) return sendMoop(state, moop.to, moop.body);
      return { ...addLines(state, [{ kind: 'prompt', text }, { kind: 'claude', text: claudeAnswer }]), draft: '' };
    }
  }
}
