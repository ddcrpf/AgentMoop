import { useEffect, useState, type FormEvent } from 'react';
import { useUser } from '@clerk/react';
import { useApi, ApiError } from '../api';
import { tagCandidates } from '../tagSuggestions';
export function Onboarding({onDone}:{onDone:(h:string)=>void}){
  const api=useApi();const {user}=useUser();const [value,setValue]=useState('');const [error,setError]=useState('');const [ideas,setIdeas]=useState<string[]>([]);
  useEffect(()=>{
    if(!user)return;
    const candidates=tagCandidates({firstName:user.firstName,lastName:user.lastName,username:user.username,email:user.primaryEmailAddress?.emailAddress??null});
    if(candidates.length)api<{suggestions:string[]}>('/api/me/handle-suggestions',{body:{candidates}}).then(r=>setIdeas(r.suggestions),()=>setIdeas([]));
  },[user,api]);
  async function submit(e:FormEvent){e.preventDefault();setError('');
    try{const r=await api<{handle:string}>('/api/me/handle',{body:{handle:value.trim().toLowerCase()}});onDone(r.handle);}
    catch(err){setError(err instanceof ApiError&&err.code==='HANDLE_UNAVAILABLE'?'That tag is taken.':'Use 3–32 lowercase letters, numbers or underscores.');}}
  return <main className="center"><form className="panel card-form" onSubmit={submit}>
    <h1>Choose your moop tag</h1><p className="muted">Friends find you by it. Lowercase letters, numbers and _. You can't change it later.</p>
    {ideas.length>0&&<div className="tag-ideas" role="group" aria-label="Suggested tags"><span className="muted">Free right now:</span>{ideas.map(t=><button type="button" key={t} className={'tag-idea'+(value===t?' is-picked':'')} aria-pressed={value===t} onClick={()=>setValue(t)}>@{t}</button>)}</div>}
    <label className="field">Moop tag<input value={value} onChange={e=>setValue(e.target.value)} pattern="[a-zA-Z0-9_]{3,32}" required autoFocus/></label>
    {error&&<p className="error" role="alert">{error}</p>}<button>Claim tag</button></form></main>;
}
