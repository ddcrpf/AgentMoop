import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api';
import { ToolTiles } from '../components/ToolTiles';
type Connection={id:string;label:string;scope:string;revoked:number};
export function Setup(){
  const api=useApi();const [connections,setConnections]=useState<Connection[]>([]);const [note,setNote]=useState('');
  const load=useCallback(()=>{api<Connection[]>('/api/connections').then(setConnections).catch(()=>setNote('Could not refresh your tools.'));},[api]);
  useEffect(load,[load]);
  const revoke=(c:Connection)=>api(`/api/connections/${c.id}/revoke`,{body:{}}).then(load).catch(()=>setNote('Something went wrong. Try again.'));
  return <main className="page setup">
    <Link to="/app" className="back">Back to Home</Link>
    <section className="panel"><h1>Connect your tools</h1><ToolTiles/></section>
    <section className="panel"><h2>Connected tools</h2>{connections.length?<div className="list">{connections.map(c=><div className="item" key={c.id}><span>{c.label} <small className="muted">{c.scope==='delivery'?'Local receiver':'Messages'}</small></span><span className="grow"/>{c.revoked?<span className="muted">Revoked</span>:<button className="secondary" onClick={()=>revoke(c)}>Revoke</button>}</div>)}</div>:<p className="muted">Tools you connect appear here.</p>}
      {note&&<p role="status" className="note">{note}</p>}</section>
  </main>;
}
