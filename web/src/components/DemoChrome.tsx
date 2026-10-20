// Static VS Code frame around the landing demo: title bar, activity bar, explorer and editor.
type Token = [kind: '' | 'kw' | 'fn' | 'str' | 'ty' | 'cm', text: string];

const code: Token[][] = [
  [['kw', 'export async function '], ['fn', 'checkSession'], ['', '(token: '], ['ty', 'string'], ['', ') {']],
  [['kw', '  const '], ['', 'session = '], ['kw', 'await '], ['', 'sessions.'], ['fn', 'find'], ['', '(token);']],
  [['kw', '  if '], ['', '(!session) '], ['kw', 'return '], ['fn', 'deny'], ['', '('], ['str', "'no session'"], ['', ');']],
  [['kw', '  if '], ['', '(session.expiresAt < Date.'], ['fn', 'now'], ['', '()) {']],
  [['cm', '    // expired sessions fall through here']],
  [['', '  }']],
  [['kw', '  return '], ['fn', 'allow'], ['', '(session.user);']],
  [['', '}']],
];

export function WindowDots() {
  return <span className="demo-dots" aria-hidden="true"><i/><i/><i/></span>;
}

export function ActivityBar() {
  return <div className="demo-activity" aria-hidden="true">
    <svg viewBox="0 0 24 24" className="is-active"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>
    <svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>
    <svg viewBox="0 0 24 24"><circle cx="7" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="9" r="2"/><path d="M7 7v10M17 11c0 4-10 2-10 6"/></svg>
    <svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 13h7v7h-7zM4 13h7v7H4zM15 3l5 5-5 5-5-5z"/></svg>
  </div>;
}

export function Explorer() {
  return <div className="demo-explorer" aria-hidden="true">
    <p className="demo-explorer-title">Explorer</p>
    <ul>
      <li className="demo-folder">src/</li>
      <li className="demo-nested is-active">auth.ts</li>
      <li className="demo-nested">session.ts</li>
      <li>README.md</li>
    </ul>
  </div>;
}

export function Editor() {
  return <div className="demo-editor" aria-hidden="true">
    <div className="demo-editor-tabs"><span className="is-active">auth.ts</span></div>
    <pre className="demo-code">{code.map((line, i) => <span key={i} className="demo-code-line"><span className="demo-gutter">{i + 1}</span>{line.map(([kind, text], j) => <span key={j} className={kind ? `tok-${kind}` : undefined}>{text}</span>)}{'\n'}</span>)}</pre>
  </div>;
}
