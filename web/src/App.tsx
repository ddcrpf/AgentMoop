import { Navigate, Route, Routes, Link, NavLink, useLocation } from 'react-router';
import { SignIn, SignUp, UserButton, useAuth } from '@clerk/react';
import { useCallback, useEffect, useState } from 'react';
import { useApi } from './api';
import { useEvents } from './events';
import { Home } from './pages/Home';
import { Landing } from './pages/Landing';
import { Inbox } from './pages/Inbox';
import { Onboarding } from './pages/Onboarding';
import { Consent } from './pages/Consent';
import { Setup } from './pages/Setup';
import { ToolSetup } from './pages/ToolSetup';
import { Docs, PublicDocs } from './pages/Docs';
import { ThemeSwitch } from './components/ThemeSwitch';
export function App(){
  const {isLoaded,isSignedIn}=useAuth();const location=useLocation();
  if(!isLoaded)return null;
  if(location.pathname.startsWith('/sign-in'))return <main className="auth"><Wordmark/><SignIn routing="path" path="/sign-in"/></main>;
  if(location.pathname.startsWith('/sign-up'))return <main className="auth"><Wordmark/><SignUp routing="path" path="/sign-up"/></main>;
  if(location.pathname==='/')return <Landing signedIn={!!isSignedIn}/>;
  if(!isSignedIn&&/^\/docs(\/|$)/.test(location.pathname))return <PublicDocs/>;
  if(!isSignedIn)return <Navigate to={'/sign-in?redirect_url='+encodeURIComponent(location.pathname+location.search)} replace/>;
  return <Member/>;
}
function Wordmark(){return <span className="wordmark">agentmoop<span className="wordmark-dot" aria-hidden="true"/></span>;}
function Member(){
  const api=useApi();const [handle,setHandle]=useState<string|null|undefined>(undefined);const [failed,setFailed]=useState(false);
  const loadMe=useCallback(()=>{setFailed(false);api<{handle:string|null}>('/api/me').then(r=>setHandle(r.handle),()=>setFailed(true));},[api]);
  useEffect(loadMe,[loadMe]);
  const [unread,setUnread]=useState(0);
  const loadUnread=useCallback(()=>{api<{friends:{unread:number}[]}>('/api/contacts').then(r=>setUnread(r.friends.reduce((n,f)=>n+f.unread,0)),()=>{});},[api]);
  const path=useLocation().pathname;
  useEffect(()=>{if(handle)loadUnread();},[handle,path,loadUnread]);
  useEvents(loadUnread);
  useEffect(()=>{document.title=unread?`(${unread}) AgentMoop`:'AgentMoop';},[unread]);
  if(failed)return <main className="center"><div className="panel"><p role="alert">AgentMoop couldn't load your account.</p><button onClick={loadMe}>Retry</button></div></main>;
  if(handle===undefined)return null;
  if(handle===null)return <Onboarding onDone={setHandle}/>;
  return <div className="shell">
    <header className="topbar">
      <Link to="/app" className="brand" aria-label="AgentMoop home"><Wordmark/></Link>
      <nav className="tabs" aria-label="Main"><NavLink to="/app" end>Home</NavLink><NavLink to="/inbox">Inbox{unread>0&&<> <span className="count">{unread}<span className="sr-only"> unread</span></span></>}</NavLink><NavLink to="/docs">Docs</NavLink></nav>
      <div className="topbar-end"><ThemeSwitch/><UserButton/></div>
    </header>
    <Routes>
      <Route path="/app" element={<Home handle={handle}/>}/>
      <Route path="/inbox" element={<Inbox handle={handle}/>}/>
      <Route path="/inbox/:conversationId" element={<Inbox handle={handle}/>}/>
      <Route path="/setup" element={<Setup/>}/>
      <Route path="/setup/:tool" element={<ToolSetup/>}/>
      <Route path="/docs" element={<Docs/>}/>
      <Route path="/docs/:page" element={<Docs/>}/>
      <Route path="/oauth/consent" element={<Consent handle={handle}/>}/>
      <Route path="*" element={<Navigate to="/app" replace/>}/>
    </Routes>
  </div>;
}
