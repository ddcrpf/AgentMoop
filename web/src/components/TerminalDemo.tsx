import { useEffect, useReducer, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { ActivityBar, Editor, Explorer, WindowDots } from './DemoChrome';
import { cardsFor, createDemoState, demoReducer, REPLY_DELAY_MS, type DemoCard, type DemoLine, type Friend } from './terminalDemoState';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Types the text out a few characters per frame; shows it at once with reduced motion. */
function TypedText({ text }: { text: string }) {
  const [shown, setShown] = useState(() => reducedMotion() ? text.length : 0);
  useEffect(() => {
    if (shown >= text.length) return;
    const timer = window.setTimeout(() => setShown(count => Math.min(text.length, count + 3)), 16);
    return () => window.clearTimeout(timer);
  }, [shown, text]);
  return <><span aria-hidden="true">{text.slice(0, shown)}</span><span className="sr-only">{text}</span></>;
}

function OutputLine({ line }: { line: DemoLine }) {
  if (line.kind === 'sent') return <p className="demo-dim">{line.text}</p>;
  if (line.kind === 'prompt') return <p className="demo-echo"><span aria-hidden="true">&gt; </span>{line.text}</p>;
  return <p className="demo-claude"><TypedText text={line.text}/></p>;
}

type CardProps = { card: DemoCard; onReply: () => void; onDismiss: () => void; replied?: boolean };

function Card({ card, onReply, onDismiss, replied }: CardProps) {
  return <div className="demo-card">
    <p><span className="demo-sender">{card.from}</span>: {card.body}</p>
    <div className="demo-actions">
      <button type="button" onClick={onReply} disabled={replied} aria-label={`Reply to ${card.from}`}>[Reply]</button>
      <button type="button" onClick={onDismiss} aria-label={`Dismiss message from ${card.from}`}>[Dismiss]</button>
    </div>
  </div>;
}

export function TerminalDemo() {
  const [state, dispatch] = useReducer(demoReducer, undefined, createDemoState);
  const input = useRef<HTMLInputElement>(null);
  const timers = useRef(new Map<number, number>());

  useEffect(() => {
    for (const card of state.cards) {
      if (card.from !== 'you' || card.answered || timers.current.has(card.id)) continue;
      timers.current.set(card.id, window.setTimeout(() => dispatch({ type: 'deliver', id: card.id }), REPLY_DELAY_MS));
    }
  }, [state.cards]);

  useEffect(() => () => clearTimers(), []);

  function clearTimers() {
    timers.current.forEach(timer => window.clearTimeout(timer));
    timers.current.clear();
  }

  function send(event: FormEvent) {
    event.preventDefault();
    dispatch({ type: 'send' });
  }

  function reset() {
    clearTimers();
    dispatch({ type: 'reset' });
  }

  function prefill(friend: Friend) {
    dispatch({ type: 'prefill', friend });
    input.current?.focus();
  }

  function focusPrompt(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest('button, input')) input.current?.focus();
  }

  return <section className="demo" aria-label="Interactive demo">
    <div className="demo-window">
      <div className="demo-titlebar"><WindowDots/><span className="demo-title">auth-service — Visual Studio Code</span></div>
      <div className="demo-body">
        <ActivityBar/>
        <Explorer/>
        <div className="demo-main">
          <Editor/>
          <div className="demo-panel">
            <div className="demo-panel-tabs">
              <span>Problems</span><span>Output</span><span className="is-active">Terminal</span>
              <button type="button" className="demo-reset" onClick={reset}>Reset</button>
            </div>
            <div className="demo-term demo-you" onClick={focusPrompt}>
              <div className="demo-welcome"><strong>Claude Code</strong><span className="demo-dim">cwd: ~/auth-service</span></div>
              <div className="demo-output" aria-live="polite">
                {state.lines.map(line => <OutputLine key={line.id} line={line}/>)}
                {cardsFor(state, 'you').slice(-2).map(card => <Card key={card.id} card={card}
                  onReply={() => { dispatch({ type: 'reply', id: card.id }); input.current?.focus(); }}
                  onDismiss={() => dispatch({ type: 'dismiss', id: card.id })}/>)}
              </div>
              <div className="demo-line"><span className="demo-brand">agentmoop</span><button type="button" onClick={() => prefill('maya')}>@maya</button><button type="button" onClick={() => prefill('kai')}>@kai</button><span className="demo-dim">hide</span></div>
              <form className="demo-prompt" onSubmit={send}>
                <span className="demo-caret" aria-hidden="true">&gt;</span>
                <input ref={input} value={state.draft} onChange={event => dispatch({ type: 'draft', value: event.target.value })}
                  aria-label="Demo prompt" placeholder="@maya can you check the auth bug?" autoComplete="off" spellCheck={false} maxLength={300}/>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>

    <section className="demo-maya" aria-label="Maya's terminal">
      <div className="demo-titlebar"><WindowDots/><span className="demo-title">Maya's terminal</span></div>
      <div className="demo-term">
        <div className="demo-welcome"><strong>Claude Code</strong><span className="demo-dim">cwd: ~/billing</span></div>
        <div className="demo-output" aria-live="polite">
          {cardsFor(state, 'maya').slice(-2).map(card => <Card key={card.id} card={card} replied={card.answered}
            onReply={() => dispatch({ type: 'deliver', id: card.id })}
            onDismiss={() => dispatch({ type: 'dismiss', id: card.id })}/>)}
        </div>
        <div className="demo-line"><span className="demo-brand">agentmoop</span><span>@you</span><span className="demo-dim">hide</span></div>
        <div className="demo-prompt" aria-hidden="true"><span className="demo-caret">&gt;</span><span className="demo-dim">Maya is working</span></div>
      </div>
    </section>
  </section>;
}
