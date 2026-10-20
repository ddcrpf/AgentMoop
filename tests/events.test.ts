import { beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db/open.js';
import { subscribe, type PingEvent } from '../src/events/bus.js';
import { sendMessage, reply } from '../src/messages/service.js';
import { requestFriend, acceptRequest, ignoreRequest, disconnect } from '../src/contacts/service.js';
import { createUser } from './fixtures/users.js';
let db:ReturnType<typeof openDatabase>;
beforeEach(()=>{db=openDatabase(':memory:');});
const principal=(userId:string)=>({userId,connectionId:'t',scopes:['messages']});
const watch=(ids:string[])=>{
  const seen:Record<string,PingEvent[]>=Object.fromEntries(ids.map(id=>[id,[]]));
  const offs=ids.map(id=>subscribe(id,ev=>seen[id]!.push(ev)));
  return {seen,off:()=>offs.forEach(off=>off())};
};
it('tells both people about requests and messages, and nobody else',()=>{
  const a=createUser(db,'alice'),b=createUser(db,'bob'),e=createUser(db,'eve');
  const seen:Record<string,PingEvent[]>={[a]:[],[b]:[],[e]:[]};
  const offs=[a,b,e].map(id=>subscribe(id,ev=>seen[id]!.push(ev)));
  requestFriend(db,a,'bob');acceptRequest(db,b,a);
  const m=sendMessage(db,{userId:a,connectionId:'t',scopes:['messages']},{to:'bob',body:'hi',client_message_id:randomUUID()});
  expect(seen[b]).toEqual([{type:'request.created',userId:a},{type:'message.created',conversationId:m.conversationId,messageId:m.id}]);
  expect(seen[a]).toEqual([{type:'request.accepted',userId:b},{type:'message.created',conversationId:m.conversationId,messageId:m.id}]);
  expect(seen[e]).toEqual([]);
  offs.forEach(off=>off());
});
it('publishes nothing when the send fails',()=>{
  const a=createUser(db,'alice');createUser(db,'bob');const got:PingEvent[]=[];const off=subscribe(a,ev=>got.push(ev));
  expect(()=>sendMessage(db,{userId:a,connectionId:'t',scopes:['messages']},{to:'bob',body:'hi',client_message_id:randomUUID()})).toThrow();
  expect(got).toEqual([]);off();
});
it('keeps the message and other listeners when one listener throws',()=>{
  const a=createUser(db,'alice'),b=createUser(db,'bob');
  requestFriend(db,a,'bob');acceptRequest(db,b,a);
  const got:PingEvent[]=[];
  const offs=[subscribe(b,()=>{throw new Error('listener failure');}),subscribe(b,ev=>got.push(ev))];
  const m=sendMessage(db,principal(a),{to:'bob',body:'hi',client_message_id:randomUUID()});
  expect(m.body).toBe('hi');
  expect(got).toContainEqual({type:'message.created',conversationId:m.conversationId,messageId:m.id});
  offs.forEach(off=>off());
});
it('tells both people about a reply',()=>{
  const a=createUser(db,'alice'),b=createUser(db,'bob');
  requestFriend(db,a,'bob');acceptRequest(db,b,a);
  const m=sendMessage(db,principal(a),{to:'bob',body:'hi',client_message_id:randomUUID()});
  const {seen,off}=watch([a,b]);
  const r=reply(db,principal(b),{message_id:m.id,body:'yo',client_message_id:randomUUID()});
  const event={type:'message.created' as const,conversationId:r.conversationId,messageId:r.id};
  expect(seen[a]).toEqual([event]);
  expect(seen[b]).toEqual([event]);
  off();
});
it('tells both sides when a friendship is removed, and only once', ()=>{
  const a=createUser(db,'alice'),b=createUser(db,'bob');
  requestFriend(db,a,'bob');acceptRequest(db,b,a);
  const {seen,off}=watch([a,b]);
  disconnect(db,a,b);
  expect(seen[b]).toEqual([{type:'contact.removed',userId:a}]);
  expect(seen[a]).toEqual([{type:'contact.removed',userId:b}]);
  disconnect(db,a,b);
  expect(seen[a]).toHaveLength(1);
  expect(seen[b]).toHaveLength(1);
  off();
});
it('publishes nothing on disconnect when there was no accepted row',()=>{
  const a=createUser(db,'alice'),e=createUser(db,'eve');
  requestFriend(db,e,'alice');
  const {seen,off}=watch([a,e]);
  disconnect(db,a,e);
  expect(seen[a]).toEqual([]);
  expect(seen[e]).toEqual([]);
  off();
});
it('publishes nothing when a request is ignored', ()=>{
  const a=createUser(db,'alice'),b=createUser(db,'bob');
  requestFriend(db,a,'bob');
  const {seen,off}=watch([a,b]);
  ignoreRequest(db,b,a);
  expect(seen[a]).toEqual([]);
  expect(seen[b]).toEqual([]);
  off();
});
it('publishes nothing for a repeat request while pending or already accepted', ()=>{
  const a=createUser(db,'alice'),b=createUser(db,'bob');
  requestFriend(db,a,'bob');
  const {seen,off}=watch([a,b]);
  requestFriend(db,a,'bob');
  expect(seen[a]).toEqual([]);
  expect(seen[b]).toEqual([]);
  acceptRequest(db,b,a);
  seen[a]!.length=0;seen[b]!.length=0;
  requestFriend(db,a,'bob');
  expect(seen[a]).toEqual([]);
  expect(seen[b]).toEqual([]);
  off();
});
it('publishes nothing when a request follows an ignore', ()=>{
  const a=createUser(db,'alice'),b=createUser(db,'bob');
  requestFriend(db,a,'bob');ignoreRequest(db,b,a);
  const {seen,off}=watch([a,b]);
  expect(requestFriend(db,a,'bob').status).toBe('sent');
  expect(seen[a]).toEqual([]);
  expect(seen[b]).toEqual([]);
  off();
});
it('accepts on a crossing request and tells the first requester', ()=>{
  const a=createUser(db,'alice'),b=createUser(db,'bob');
  requestFriend(db,a,'bob');
  const {seen,off}=watch([a,b]);
  expect(requestFriend(db,b,'alice')).toEqual({status:'accepted',otherId:a});
  expect(seen[a]).toEqual([{type:'request.accepted',userId:b}]);
  expect(seen[b]).toEqual([]);
  off();
});
