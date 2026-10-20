import { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router';
import { TerminalDemo } from '../components/TerminalDemo';
import { useTheme } from '../theme';

const GradientASCII = lazy(() => import('../vendor/gradient-ascii/GradientASCII'));

const HEADLINE = 'Stop pasting your terminal into Slack.';
const CTA = 'Get your moop tag';

// Paper through faint teal tints; the dark ramp uses the dark tokens.
const backgroundLook = {
  light: { colors: ['#F7F7F5', '#E6F2F0', '#BFDDD8', '#8CC3BA'], lightMode: true, glyphOpacity: 0.5, gradientOpacity: 0.12 },
  dark: { colors: ['#111315', '#16302D', '#2F6E66', '#5EC4B6'], lightMode: false, glyphOpacity: 0.4, gradientOpacity: 0.12 },
};

const story = [
  'Before: switch to Slack, paste a screenshot, re-explain the bug.',
  'With AgentMoop: type @maya and your question at the prompt.',
  'Maya sees it above her prompt and replies from hers.',
];

export function Landing({ signedIn, appOrigin = '' }: { signedIn: boolean; appOrigin?: string }) {
  const theme = useTheme();
  useEffect(() => { document.title = 'AgentMoop — friends in your agent'; }, []);
  const start = appOrigin + (signedIn ? '/app' : '/sign-up');
  const account = { href: appOrigin + (signedIn ? '/app' : '/sign-in'), label: signedIn ? 'Open app' : 'Sign in' };
  const docs = appOrigin + '/docs';

  return <div className="landing">
    <Suspense fallback={null}>
      <GradientASCII className="lp-bg" aria-hidden="true" shape="horizon" {...backgroundLook[theme]} characters=" .:-=+*" cellSize={16} density={0.6} glow={0} flicker={0.05} speed={0.25} flow={0.3} grain={0} mouseInteraction={false} clickEffect="none" intro={false} fontFamily="ui-monospace, Menlo, Consolas, monospace" dpr={1}/>
    </Suspense>
    <header className="lp-header">
      <div className="lp-wrap lp-header-inner">
        <Link className="brand" to="/" aria-label="AgentMoop home"><span className="wordmark">agentmoop<span className="wordmark-dot" aria-hidden="true"/></span></Link>
        <nav className="lp-nav" aria-label="Landing page">
          <a href={docs}>Docs</a>
          <a href={account.href}>{account.label}</a>
        </nav>
        <a className="button lp-header-cta" href={start} aria-label={CTA}><span className="lp-cta-long">{CTA}</span><span className="lp-cta-short" aria-hidden="true">Get tag</span></a>
      </div>
    </header>

    <main>
      <section className="lp-hero" aria-labelledby="hero-title">
        <div className="lp-wrap">
          <h1 id="hero-title">{HEADLINE}</h1>
          <p className="lp-lede">Message a teammate from your Claude Code prompt. It lands above their prompt, with the screenshot, file or context attached.</p>
          <div className="lp-actions">
            <a className="button lp-button" href={start}>{CTA}</a>
            <a className="lp-link" href={docs}>Read the docs</a>
          </div>
        </div>
      </section>

      <section className="lp-demo" aria-label="See it work">
        <div className="lp-wrap"><TerminalDemo/></div>
      </section>

      <section className="lp-story" aria-label="Before and after">
        <div className="lp-wrap"><ul>{story.map(line => <li key={line}>{line}</li>)}</ul></div>
      </section>

      <section className="lp-works">
        <div className="lp-wrap"><p>Works with Claude Code, Codex and the Claude app. <a href={docs}>Set it up in the docs</a></p></div>
      </section>

      <section className="lp-final" aria-labelledby="final-title">
        <div className="lp-wrap">
          <h2 id="final-title">{HEADLINE}</h2>
          <a className="button lp-button" href={start}>{CTA}</a>
        </div>
      </section>
    </main>

    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-inner"><span>AgentMoop</span><span className="lp-footer-links"><a href={docs}>Docs</a><a href={account.href}>{account.label}</a></span></div>
    </footer>
  </div>;
}
