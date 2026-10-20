import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { issueToken } from '../src/auth/tokens.js';
import { fixture } from './fixtures/http.js';
import { bearer, createUser } from './fixtures/users.js';
let f:Awaited<ReturnType<typeof fixture>>;
beforeEach(async()=>{f=await fixture();});afterEach(async()=>{await f.close();});
const api=(path:string,headers:Record<string,string>={},init:RequestInit={})=>fetch(f.url+path,{...init,headers:{'Content-Type':'application/json',...headers}});
it('serves the publishable key and rejects missing or bad tokens',async()=>{
  expect(await (await api('/api/config')).json()).toEqual({publishableKey:f.config.clerkPublishableKey});
  expect((await api('/api/me')).status).toBe(401);
  expect((await api('/api/me',{Authorization:'Bearer forged'})).status).toBe(401);
});
it('onboards a new Clerk user once and blocks member APIs before that',async()=>{
  const h={Authorization:'Bearer test:user_new'};
  expect(await (await api('/api/me',h)).json()).toEqual({handle:null});
  expect((await api('/api/contacts',h)).status).toBe(403);
  expect((await api('/api/me/handle',h,{method:'POST',body:JSON.stringify({handle:'Bad Tag'})})).status).toBe(400);
  createUser(f.db,'taken');
  expect((await api('/api/me/handle',h,{method:'POST',body:JSON.stringify({handle:'taken'})})).status).toBe(409);
  expect((await api('/api/me/handle',h,{method:'POST',body:JSON.stringify({handle:'newbie'})})).status).toBe(201);
  expect(await (await api('/api/me',h)).json()).toEqual({handle:'newbie'});
  expect((await api('/api/me/handle',h,{method:'POST',body:JSON.stringify({handle:'other'})})).status).toBe(409);
  expect((await api('/api/contacts',{Authorization:'Bearer test:user_someone_else'})).status).toBe(403);
});
it('runs the request, accept, message, read flow and isolates a third person',async()=>{
  createUser(f.db,'alice');createUser(f.db,'bob');createUser(f.db,'eve');
  const post=(who:string,path:string,body:object)=>api(path,bearer(who),{method:'POST',body:JSON.stringify(body)});
  expect(await (await post('alice','/api/requests',{tag:' @Bob'})).json()).toEqual({status:'sent'});
  const incoming=(await (await api('/api/contacts',bearer('bob'))).json()).incoming;
  expect(incoming).toHaveLength(1);
  expect((await post('bob',`/api/requests/${incoming[0].id}/accept`,{})).status).toBe(200);
  const cid=randomUUID();
  const first=await (await post('alice','/api/messages',{to:'bob',body:'<b>hi</b>',client_message_id:cid})).json();
  const again=await (await post('alice','/api/messages',{to:'bob',body:'<b>hi</b>',client_message_id:cid})).json();
  expect(again.message.id).toBe(first.message.id);
  const conv=first.message.conversationId;
  const page=await (await api(`/api/conversations/${conv}/messages`,bearer('bob'))).json();
  expect(page.items[0].body).toBe('<b>hi</b>');
  expect((await api(`/api/conversations/${conv}/messages`,bearer('eve'))).status).toBe(404);
  let bob=(await (await api('/api/contacts',bearer('bob'))).json()).friends[0];expect(bob.unread).toBe(1);
  await post('bob',`/api/conversations/${conv}/read`,{last_read_id:first.message.id});
  await post('bob',`/api/conversations/${conv}/read`,{last_read_id:0});
  bob=(await (await api('/api/contacts',bearer('bob'))).json()).friends[0];expect(bob.unread).toBe(0);
  expect((await post('eve',`/api/conversations/${conv}/read`,{last_read_id:1})).status).toBe(404);
  expect((await post('eve','/api/messages',{to:'bob',body:'x',client_message_id:randomUUID()})).status).toBe(404);
  expect((await post('alice','/api/requests',{tag:'ghost'})).status).toBe(404);
});
it('lists and revokes only your own connections',async()=>{
  const a=createUser(f.db,'alice');createUser(f.db,'eve');
  const t=issueToken(f.db,a,'messages','Claude');
  expect((await (await api('/api/connections',bearer('eve'))).json())).toEqual([]);
  expect((await api(`/api/connections/${t.connectionId}/revoke`,bearer('eve'),{method:'POST'})).status).toBe(200);
  expect((await (await api('/api/connections',bearer('alice'))).json())[0].revoked).toBe(0);
  await api(`/api/connections/${t.connectionId}/revoke`,bearer('alice'),{method:'POST'});
  expect((await (await api('/api/connections',bearer('alice'))).json())[0].revoked).toBe(1);
});
it('removed sponsored and admin ad endpoints answer 404',async()=>{
  createUser(f.db,'ads_gone');const h=bearer('ads_gone');
  for(const [path,method] of [['/api/me/sponsored','POST'],['/api/admin/ads','GET'],['/api/admin/stats','GET']] as const){
    expect((await api(path,h,{method,...(method==='POST'?{body:JSON.stringify({opt_in:true})}:{})})).status).toBe(404);
  }
});
