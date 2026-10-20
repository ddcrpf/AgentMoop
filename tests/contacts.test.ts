import { beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db/open.js';
import { requestFriend, acceptRequest, ignoreRequest, disconnect, memberContacts, normalizeTag } from '../src/contacts/service.js';
import { sendMessage } from '../src/messages/service.js';
import { createUser } from './fixtures/users.js';
let db:ReturnType<typeof openDatabase>,alice:string,bob:string;
beforeEach(()=>{db=openDatabase(':memory:');alice=createUser(db,'alice');bob=createUser(db,'bob');});
const send=(from:string)=>sendMessage(db,{userId:from,connectionId:'t',scopes:['messages']},{to:from===alice?'bob':'alice',body:'hi',client_message_id:randomUUID()});
it('normalizes loose tags and rejects unknown, invalid and own tags',()=>{
  expect(normalizeTag('  @Bob ')).toBe('bob');
  expect(()=>requestFriend(db,alice,'nobody_here')).toThrow('NO_SUCH_TAG');
  expect(()=>requestFriend(db,alice,'x')).toThrow('NO_SUCH_TAG');
  expect(()=>requestFriend(db,alice,'@ALICE')).toThrow('CANNOT_ADD_YOURSELF');
});
it('needs acceptance before any message flows',()=>{
  expect(requestFriend(db,alice,'@Bob').status).toBe('sent');
  expect(()=>send(alice)).toThrow('NOT_FOUND');
  expect(memberContacts(db,bob).incoming).toEqual([{id:alice,handle:'alice'}]);
  expect(memberContacts(db,alice).outgoing).toEqual([{id:bob,handle:'bob'}]);
  acceptRequest(db,bob,alice);
  send(alice);
  const f=memberContacts(db,bob).friends[0]!;
  expect(f).toMatchObject({handle:'alice',unread:1,lastMessage:{body:'hi',senderHandle:'alice'}});
});
it('keeps ignoring silent and lets the ignorer connect later',()=>{
  requestFriend(db,alice,'bob');ignoreRequest(db,bob,alice);
  expect(memberContacts(db,bob).incoming).toEqual([]);
  expect(memberContacts(db,alice).outgoing).toEqual([{id:bob,handle:'bob'}]);
  expect(requestFriend(db,alice,'bob').status).toBe('sent');
  expect(requestFriend(db,bob,'alice').status).toBe('accepted');
});
it('treats crossing requests as acceptance and requires a new accepted request after disconnect',()=>{
  requestFriend(db,alice,'bob');expect(requestFriend(db,bob,'alice').status).toBe('accepted');
  disconnect(db,alice,bob);expect(()=>send(bob)).toThrow('NOT_FOUND');
  expect(requestFriend(db,bob,'alice').status).toBe('sent');
  expect(()=>send(bob)).toThrow('NOT_FOUND');
  expect(()=>acceptRequest(db,bob,alice)).toThrow('NOT_FOUND');
});
it('rate limits requests',()=>{
  for(let i=0;i<20;i++)createUser(db,'user'+i);
  for(let i=0;i<20;i++)requestFriend(db,alice,'user'+i);
  expect(()=>requestFriend(db,alice,'bob')).toThrow('RATE_LIMITED');
});
it('counts unknown-tag attempts toward the rate limit',()=>{
  for(let i=0;i<20;i++)expect(()=>requestFriend(db,alice,'ghost'+i)).toThrow('NO_SUCH_TAG');
  expect(()=>requestFriend(db,alice,'bob')).toThrow('RATE_LIMITED');
});
it('disconnect does not reset or leak an ignored request',()=>{
  requestFriend(db,alice,'bob');ignoreRequest(db,bob,alice);
  disconnect(db,alice,bob);
  expect(requestFriend(db,alice,'bob').status).toBe('sent');
  expect(memberContacts(db,bob).incoming).toEqual([]);
  expect(memberContacts(db,alice).outgoing).toEqual([{id:bob,handle:'bob'}]);
});
it('keeps an ignored contact from messaging',()=>{
  requestFriend(db,alice,'bob');ignoreRequest(db,bob,alice);
  expect(()=>send(alice)).toThrow('NOT_FOUND');
  expect(()=>send(bob)).toThrow('NOT_FOUND');
});
it('treats repeat requests as no-ops while pending and accepted',()=>{
  expect(requestFriend(db,alice,'bob').status).toBe('sent');
  expect(requestFriend(db,alice,'bob').status).toBe('sent');
  expect(memberContacts(db,bob).incoming).toEqual([{id:alice,handle:'alice'}]);
  expect(memberContacts(db,alice).outgoing).toEqual([{id:bob,handle:'bob'}]);
  acceptRequest(db,bob,alice);
  expect(requestFriend(db,alice,'bob').status).toBe('accepted');
  const c=memberContacts(db,alice);
  expect(c.friends).toHaveLength(1);
  expect(c.incoming).toEqual([]);
  expect(c.outgoing).toEqual([]);
});
