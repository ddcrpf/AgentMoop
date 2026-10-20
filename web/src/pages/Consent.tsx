import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useApi } from '../api';
type RequestInfo={clientName:string;redirectOrigin:string};
const EXPIRED='This connection request expired. Start again from your AI tool.';
export function Consent({handle}:{handle:string}){
  const api=useApi();const [params]=useSearchParams();const id=params.get('request')??'';
  const [info,setInfo]=useState<RequestInfo|null>(null);const [error,setError]=useState('');const [deciding,setDeciding]=useState(false);
  useEffect(()=>{
    if(!id){setError(EXPIRED);return;}
    api<RequestInfo>(`/api/oauth/requests/${encodeURIComponent(id)}`).then(setInfo).catch(()=>setError(EXPIRED));
  },[api,id]);
  const decide=(d:'approve'|'deny')=>{
    if(deciding)return;setDeciding(true);
    api<{redirect:string}>(`/api/oauth/requests/${encodeURIComponent(id)}/${d}`,{body:{}}).then(r=>window.location.assign(r.redirect)).catch(()=>{setError(EXPIRED);setDeciding(false);});
  };
  if(error)return <main className="center"><section className="panel card-form" role="alert">{error}</section></main>;
  if(!info)return null;
  return <main className="center"><section className="panel card-form">
    <h1>Connect {info.clientName}?</h1>
    <p>It will be able to see your friends, read your conversations, and send messages as <strong>@{handle}</strong>.</p>
    <p className="muted">After approving you return to {info.redirectOrigin}.</p>
    <div className="row actions"><button disabled={deciding} onClick={()=>decide('approve')}>Allow</button><button className="secondary" disabled={deciding} onClick={()=>decide('deny')}>Cancel</button></div>
  </section></main>;
}
