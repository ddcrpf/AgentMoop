import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useApi, ApiError } from '../api';
import { useEvents } from '../events';
import { ToolTiles } from '../components/ToolTiles';
type Person={id:string;handle:string};
type Friend=Person&{conversationId:string|null};
type Contacts={friends:Friend[];incoming:Person[];outgoing:Person[]};
type Connection={revoked:number};
export function Home({handle}:{handle:string}){
  const api=useApi();const [contacts,setContacts]=useState<Contacts>({friends:[],incoming:[],outgoing:[]});
  const [connected,setConnected]=useState(0);const [tag,setTag]=useState('');const [note,setNote]=useState('');
  const fail=()=>setNote('Something went wrong. Try again.');
  const load=useCallback(()=>{api<Contacts>('/api/contacts').then(setContacts).catch(()=>setNote('Could not refresh your contacts.'));api<Connection[]>('/api/connections').then(r=>setConnected(r.filter(c=>!c.revoked).length)).catch(()=>setNote('Could not refresh your tools.'));},[api]);
  const [copied,setCopied]=useState('');
  useEffect(load,[load]);
  useEvents(e=>{if(e.type!=='message.created')load();});
  async function add(e:FormEvent){e.preventDefault();
    try{const r=await api<{status:string}>('/api/requests',{body:{tag}});setNote(r.status==='accepted'?'You are now friends.':'Request sent.');setTag('');load();}
    catch(err){setNote(err instanceof ApiError&&err.code==='NO_SUCH_TAG'?'No one has that moop tag.':err instanceof ApiError&&err.code==='CANNOT_ADD_YOURSELF'?'That is your own moop tag.':err instanceof ApiError&&err.code==='RATE_LIMITED'?'Too many requests. Try again later.':'Could not send the request.');}}
  const act=(id:string,what:'accept'|'ignore')=>api(`/api/requests/${id}/${what}`,{body:{}}).then(load).catch(fail);
  const remove=(p:Person)=>{if(window.confirm(`Remove @${p.handle}? You will stop receiving their messages until you accept a new request.`))api(`/api/contacts/${p.id}/disconnect`,{body:{}}).then(load).catch(fail);};
  const copyTag=()=>navigator.clipboard.writeText(handle).then(()=>setCopied('Copied'),()=>setCopied('Select and copy'));
  const hasRequests=contacts.incoming.length>0||contacts.outgoing.length>0;
  return <main className="page home">
    <div className="home-col">
      <section className="panel callsign">
        <h2 className="callsign-label">Your moop tag</h2>
        <div className="callsign-row"><p className="callsign-handle"><span className="callsign-dot" aria-hidden="true"/>@{handle}</p><button className="secondary" onClick={copyTag}>{copied||'Copy'}</button></div>
        <p className="muted callsign-hint">Share it so friends can add you.</p>
      </section>
      <section className="panel"><h2>Add a friend</h2><form onSubmit={add} className="row"><input aria-label="Friend's moop tag" placeholder="@their_moop_tag" value={tag} onChange={e=>setTag(e.target.value)} required/><button>Send request</button></form>
        {note&&<p role="status" className="note">{note}</p>}</section>
      {hasRequests&&<section className="panel scroll-panel requests"><h2>Friend requests</h2><div className="list">
        {contacts.incoming.map(p=><div className="item" key={p.id}><strong>@{p.handle}</strong><span className="grow"/><button onClick={()=>act(p.id,'accept')}>Accept</button><button className="secondary" onClick={()=>act(p.id,'ignore')}>Ignore</button></div>)}
        {contacts.outgoing.map(p=><div className="item" key={p.id}><strong>@{p.handle}</strong><span className="grow"/><span className="muted">Pending</span></div>)}</div></section>}
    </div>
    <section className="panel scroll-panel friends" aria-labelledby="friends-title">
      <h2 id="friends-title">Friends <span className="muted">{contacts.friends.length}</span></h2>
      {contacts.friends.length>0?<div className="list">{contacts.friends.map(p=><div className="item" key={p.id}><strong>@{p.handle}</strong><span className="grow"/>
        <button className="text-button" aria-label={`Remove @${p.handle}`} onClick={()=>remove(p)}>Remove</button>
        <Link className="button secondary" to={p.conversationId?`/inbox/${p.conversationId}`:'/inbox'} aria-label={`Message @${p.handle}`}>Message</Link></div>)}</div>
        :<p className="muted">No friends yet. Add someone by their moop tag.</p>}
    </section>
    <section className="panel tools" aria-labelledby="tools-title">
      <h2 id="tools-title">Connect your tools</h2>
      <ToolTiles/>
      <p className="muted tools-foot">{connected?`${connected} ${connected===1?'tool':'tools'} connected`:'No tools connected yet'} <Link to="/setup">Manage</Link></p>
    </section>
  </main>;
}
