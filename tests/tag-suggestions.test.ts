import { afterEach, beforeEach, expect, it } from 'vitest';
import { tagCandidates } from '../web/src/tagSuggestions.js';
import { fixture } from './fixtures/http.js';
import { createUser } from './fixtures/users.js';
let f:Awaited<ReturnType<typeof fixture>>;
beforeEach(async()=>{f=await fixture();});afterEach(async()=>{await f.close();});
const suggest=(candidates:unknown,who='user_new')=>fetch(f.url+'/api/me/handle-suggestions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test:'+who},body:JSON.stringify({candidates})});

it('builds one-word candidates from a name and email, valid tags only',()=>{
  const c=tagCandidates({firstName:'Grace',lastName:'Hopper',username:null,email:'g.hopper+x@example.com'},()=>0.42);
  expect(c.slice(0,4)).toEqual(['grace','gracehopper','ghopper','hopper']);
  expect(c).toContain('grace42');
  for(const t of c)expect(t).toMatch(/^[a-z0-9]{3,20}$/);
  expect(new Set(c).size).toBe(c.length);
  expect(tagCandidates({firstName:'Al',lastName:null,username:null,email:null},()=>0.1)).not.toContain('al');
});

it('returns only free, valid tags, at most four, before onboarding',async()=>{
  createUser(f.db,'grace');
  const r=await suggest(['grace','gracehopper','Bad Tag','ghopper','hopper','grace42','x']);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({suggestions:['gracehopper','ghopper','hopper','grace42']});
});

it('rejects oversized input and rate limits',async()=>{
  expect((await suggest(Array(13).fill('abcd'))).status).toBe(400);
  expect((await suggest('grace')).status).toBe(400);
  let last=200;for(let i=0;i<25;i++)last=(await suggest(['abcd'],'user_spam')).status;
  expect(last).toBe(429);
});
