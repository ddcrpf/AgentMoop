import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ClerkProvider } from '@clerk/react';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import './styles.css';
import { initTheme, palette, useTheme, type Theme } from './theme';
import { App } from './App';
initTheme();
const clerkAppearance=(theme:Theme)=>{const p=palette[theme];return {variables:{
  colorPrimary:p.accent,colorPrimaryForeground:p.onAccent,colorDanger:p.danger,colorBackground:p.surface,colorForeground:p.ink,
  colorMutedForeground:p.muted,colorInput:p.surface,colorInputForeground:p.ink,colorNeutral:p.ink,
  fontFamily:"'Figtree Variable', system-ui, sans-serif",fontFamilyButtons:"'Figtree Variable', system-ui, sans-serif",borderRadius:'6px'}};};
function Root({publishableKey}:{publishableKey:string}){
  const theme=useTheme();
  return <ClerkProvider publishableKey={publishableKey} signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/app" signUpFallbackRedirectUrl="/app" afterSignOutUrl="/" appearance={clerkAppearance(theme)}>
    <BrowserRouter><App/></BrowserRouter>
  </ClerkProvider>;
}
const root=createRoot(document.getElementById('root')!);
fetch('/api/config').then(r=>r.json()).then(({publishableKey})=>root.render(<StrictMode><Root publishableKey={publishableKey}/></StrictMode>))
  .catch(()=>root.render(<p className="fatal">AgentMoop is unavailable. Try again shortly.</p>));
