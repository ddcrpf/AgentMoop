import { useEffect } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
import { docPages, type DocPage } from '../docs/content';
const pathOf=(p:DocPage)=>p.slug?`/docs/${p.slug}`:'/docs';
export function Docs(){
  const {page:slug=''}=useParams();const index=docPages.findIndex(p=>p.slug===slug);
  const {hash}=useLocation();
  useEffect(()=>{if(!hash)window.scrollTo(0,0);},[slug,hash]);
  if(index<0)return <Navigate to="/docs" replace/>;
  const page=docPages[index];
  return <div className="docs">
    <DocsNav current={page}/>
    <main className="docs-main">
      <h1>{page.title}</h1>
      {page.lead&&<p className="docs-lead">{page.lead}</p>}
      {page.sections.length>3&&<nav className="docs-toc" aria-label="On this page"><h2>On this page</h2><ul>{page.sections.map(s=><li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ul></nav>}
      {page.sections.map(s=><section key={s.id} id={s.id} className="docs-section" aria-labelledby={`${s.id}-title`}><h2 id={`${s.id}-title`}>{s.title}</h2>{s.body}</section>)}
      <PrevNext index={index}/>
    </main>
  </div>;
}
function DocsNav({current}:{current:DocPage}){
  const navigate=useNavigate();
  return <>
    <nav className="docs-nav" aria-label="Docs"><ul>{docPages.map(p=><li key={p.slug}><NavLink to={pathOf(p)} end>{p.title}</NavLink></li>)}</ul></nav>
    <label className="docs-picker"><span className="sr-only">Docs page</span>
      <select value={pathOf(current)} onChange={e=>navigate(e.target.value)}>{docPages.map(p=><option key={p.slug} value={pathOf(p)}>{p.title}</option>)}</select>
    </label>
  </>;
}
function PrevNext({index}:{index:number}){
  const prev=docPages[index-1],next=docPages[index+1];
  return <nav className="docs-pager" aria-label="Previous and next">
    {prev&&<Link className="docs-prev" to={pathOf(prev)}><small>Previous</small>{prev.title}</Link>}
    {next&&<Link className="docs-next" to={pathOf(next)}><small>Next</small>{next.title}</Link>}
  </nav>;
}
/** Docs for visitors who are not signed in: the landing page header, then the docs. */
export function PublicDocs(){
  return <div className="docs-public">
    <header className="lp-header">
      <div className="lp-wrap lp-header-inner">
        <Link className="brand" to="/" aria-label="AgentMoop home"><span className="wordmark">agentmoop<span className="wordmark-dot" aria-hidden="true"/></span></Link>
        <nav className="lp-nav" aria-label="Account"><Link to="/sign-in">Sign in</Link></nav>
        <Link className="button lp-header-cta" to="/sign-up" aria-label="Get your moop tag"><span className="lp-cta-long">Get your moop tag</span><span className="lp-cta-short" aria-hidden="true">Get tag</span></Link>
      </div>
    </header>
    <Routes><Route path="/docs" element={<Docs/>}/><Route path="/docs/:page" element={<Docs/>}/></Routes>
  </div>;
}
