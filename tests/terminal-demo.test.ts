import { expect, test } from 'vitest';
import { cardsFor, claudeAnswer, createDemoState, demoReducer, friendReplies, type DemoState } from '../web/src/components/terminalDemoState.js';

const send = (state: DemoState, text: string) => demoReducer(demoReducer(state, { type: 'draft', value: text }), { type: 'send' });

test('starts empty with no draft', () => {
  const state = createDemoState();
  expect(state.draft).toBe('');
  expect(state.lines).toHaveLength(0);
  expect(cardsFor(state, 'you')).toHaveLength(0);
});

test('a moop prints a dim sent line and lands in the friend pane without a Claude turn', () => {
  const state = send(createDemoState(), '@maya can you check the auth bug?');
  expect(state.draft).toBe('');
  expect(state.lines).toEqual([{ id: expect.any(Number), kind: 'sent', text: 'Sent to @maya' }]);
  const [card] = cardsFor(state, 'maya');
  expect(card).toMatchObject({ from: 'you', body: 'can you check the auth bug?', answered: false });
});

test('delivering the reply puts the friend card in your terminal once', () => {
  let state = send(createDemoState(), '@maya hi');
  const id = cardsFor(state, 'maya')[0]!.id;
  state = demoReducer(state, { type: 'deliver', id });
  state = demoReducer(state, { type: 'deliver', id });
  const mine = cardsFor(state, 'you');
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ from: 'maya', body: friendReplies.maya });
  expect(cardsFor(state, 'maya')[0]!.answered).toBe(true);
});

test('kai gets the same flow with his own reply', () => {
  let state = send(createDemoState(), '@Kai look at this');
  expect(state.lines.at(-1)?.text).toBe('Sent to @kai');
  const id = state.cards[0]!.id;
  state = demoReducer(state, { type: 'deliver', id });
  expect(cardsFor(state, 'you')[0]).toMatchObject({ from: 'kai', body: friendReplies.kai });
});

test('plain text gets the canned Claude answer', () => {
  const state = send(createDemoState(), 'why is login failing?');
  expect(state.lines.map(line => [line.kind, line.text])).toEqual([['prompt', 'why is login failing?'], ['claude', claudeAnswer]]);
  expect(state.cards).toHaveLength(0);
});

test('unknown handles and empty prompts do not send', () => {
  expect(send(createDemoState(), '@stranger hello').lines.at(-1)?.kind).toBe('claude');
  expect(send(createDemoState(), '   ').lines).toHaveLength(0);
});

test('reply prefills the sender and the answered card goes away after sending', () => {
  let state = send(createDemoState(), '@maya hi');
  state = demoReducer(state, { type: 'deliver', id: state.cards[0]!.id });
  const incoming = cardsFor(state, 'you')[0]!;
  state = demoReducer(state, { type: 'reply', id: incoming.id });
  expect(state.draft).toBe('@maya ');
  state = send(state, '@maya thanks');
  expect(cardsFor(state, 'you')).toHaveLength(0);
});

test('friend buttons prefill the prompt and dismiss removes a card', () => {
  expect(demoReducer(createDemoState(), { type: 'prefill', friend: 'kai' }).draft).toBe('@kai ');
  let state = send(createDemoState(), '@maya hi');
  state = demoReducer(state, { type: 'dismiss', id: state.cards[0]!.id });
  expect(cardsFor(state, 'maya')).toHaveLength(0);
});

test('reset restores the start state', () => {
  const state = demoReducer(send(createDemoState(), 'hello'), { type: 'reset' });
  expect(state).toEqual(createDemoState());
});
