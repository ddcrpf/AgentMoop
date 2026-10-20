import { afterEach, beforeEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { fixture } from './fixtures/http.js';
import { createUser, bearer } from './fixtures/users.js';
let f:Awaited<ReturnType<typeof fixture>>;
beforeEach(async()=>{f=await fixture();createUser(f.db,'alice');createUser(f.db,'eve');});
afterEach(async()=>{await f?.close();});
const verifier='v'.repeat(64);
async function start(){
  const r=await fetch(f.url+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:['http://127.0.0.1:9999/callback'],token_endpoint_auth_method:'none',client_name:'Test client'})});
  expect(r.status).toBe(201);const client=await r.json();
  const q=new URLSearchParams({client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',scope:'messages',resource:f.url+'/mcp',state:'my-state'});
  const a=await fetch(f.url+'/authorize?'+q,{redirect:'manual'});expect(a.status).toBe(302);
  const loc=new URL(a.headers.get('location')!,f.url);expect(loc.pathname).toBe('/oauth/consent');
  return {client,id:loc.searchParams.get('request')!,cookie:a.headers.get('set-cookie')!.split(';')[0]!};
}
const call=(path:string,who:string,cookie?:string,method='POST')=>fetch(f.url+path,{method,headers:{...bearer(who),...(cookie?{Cookie:cookie}:{})}});
async function token(data:Record<string,string>){return fetch(f.url+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});}
it('sets the agentmoop_oauth consent cookie',async()=>{
  const s=await start();expect(s.cookie.startsWith('agentmoop_oauth=')).toBe(true);
});
it('approves through the consent API and runs PKCE with rotating refresh tokens',async()=>{
  const s=await start();
  expect(await (await call(`/api/oauth/requests/${s.id}`,'alice',s.cookie,'GET')).json()).toEqual({clientName:'Test client',redirectOrigin:'http://127.0.0.1:9999'});
  expect((await call(`/api/oauth/requests/${s.id}/approve`,'alice')).status).toBe(400);
  const ok=await (await call(`/api/oauth/requests/${s.id}/approve`,'alice',s.cookie)).json();
  const target=new URL(ok.redirect);expect(target.searchParams.get('state')).toBe('my-state');
  const base={client_id:s.client.client_id,code:target.searchParams.get('code')!,redirect_uri:s.client.redirect_uris[0],resource:f.url+'/mcp',grant_type:'authorization_code'};
  expect((await token({...base,code_verifier:'x'.repeat(64)})).status).toBe(400);
  expect((await token({...base,code_verifier:verifier,resource:'https://wrong.example/mcp'})).status).toBe(400);
  const good=await token({...base,code_verifier:verifier});expect(good.status).toBe(200);const t=await good.json();
  expect((await token({...base,code_verifier:verifier})).status).toBe(400);
  const refreshed=await token({client_id:s.client.client_id,grant_type:'refresh_token',refresh_token:t.refresh_token,resource:f.url+'/mcp'});expect(refreshed.status).toBe(200);const next=await refreshed.json();
  expect((await token({client_id:s.client.client_id,grant_type:'refresh_token',refresh_token:t.refresh_token})).status).toBe(400);
  expect((await token({client_id:s.client.client_id,grant_type:'refresh_token',refresh_token:next.refresh_token})).status).toBe(400);
  expect((await call(`/api/oauth/requests/${s.id}/approve`,'alice',s.cookie)).status).toBe(400);
});
it('denies, requires onboarding, and rejects unsafe registration or unknown clients',async()=>{
  const s=await start();
  expect((await fetch(f.url+`/api/oauth/requests/${s.id}/approve`,{method:'POST',headers:{Authorization:'Bearer test:user_unonboarded',Cookie:s.cookie}})).status).toBe(403);
  const denied=await (await call(`/api/oauth/requests/${s.id}/deny`,'alice',s.cookie)).json();
  expect(new URL(denied.redirect).searchParams.get('error')).toBe('access_denied');
  const bad=await fetch(f.url+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({redirect_uris:['javascript:alert(1)'],token_endpoint_auth_method:'none'})});expect(bad.status).toBe(400);
  const r=await fetch(f.url+'/authorize?client_id=missing&redirect_uri=https://evil.example',{redirect:'manual'});expect(r.status).toBe(400);expect(r.headers.get('location')).toBeNull();
});
