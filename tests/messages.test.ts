import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/open.js';
import { sendMessage, reply, listInbox, readConversation } from '../src/messages/service.js';
import type { Principal } from '../src/messages/types.js';

describe('private messages', () => {
  let db: ReturnType<typeof openDatabase>;
  const alice: Principal = { userId: 'alice', connectionId: 'test', scopes: ['messages'] };
  const bob = { ...alice, userId: 'bob' };
  const eve = { ...alice, userId: 'eve' };
  beforeEach(() => {
    db = openDatabase(':memory:');
    for (const id of ['alice', 'bob', 'eve']) db.prepare('INSERT INTO users (id,handle,password_hash) VALUES (?,?,?)').run(id,id,'fixture');
    db.prepare("INSERT INTO contacts (a,b,state) VALUES ('alice','bob','accepted')").run();
  });
  afterEach(() => db?.close());
  const input = (body = 'Hey, what’s up?') => ({ to: 'bob', body, client_message_id: randomUUID() });
  it('sends ordinary text and selected context, and replies in the same conversation', () => {
    const m = sendMessage(db, alice, {...input(), context: 'We chose SQLite.\nQuestion: retention?'});
    expect(listInbox(db,bob,0,30).items[0]).toMatchObject({body: m.body, senderHandle:'alice'});
    const r = reply(db,bob,{message_id:m.id,body:'Sounds good.',client_message_id:randomUUID()});
    expect(r.conversationId).toBe(m.conversationId);
    expect(readConversation(db,alice,m.conversationId,0,30).items).toHaveLength(2);
    expect(listInbox(db,eve,0,30).items).toEqual([]);
    expect(() => readConversation(db,eve,m.conversationId,0,30)).toThrow('NOT_FOUND');
    expect(() => reply(db,eve,{message_id:m.id,body:'intruder',client_message_id:randomUUID()})).toThrow('NOT_FOUND');
  });
  it('deduplicates retries and rejects key reuse with different content', () => {
    const i = input(); const a = sendMessage(db,alice,i);
    expect(sendMessage(db,alice,i).id).toBe(a.id);
    expect(() => sendMessage(db,alice,{...i,body:'changed'})).toThrow('IDEMPOTENCY_CONFLICT');
    expect(db.prepare('SELECT * FROM deliveries').all()).toHaveLength(1);
  });
  it('rejects strangers, revoked contacts, invalid bodies and unknown fields', () => {
    expect(() => sendMessage(db,eve,input())).toThrow('NOT_FOUND');
    for (const body of ['', ' \n ', 'a'.repeat(16001)]) expect(() => sendMessage(db,alice,input(body))).toThrow();
    expect(() => sendMessage(db,alice,{...input(),sender_id:'eve'} as never)).toThrow();
    const m = sendMessage(db,alice,input());
    db.prepare("UPDATE contacts SET state='revoked'").run();
    expect(() => sendMessage(db,alice,input())).toThrow('NOT_FOUND');
    expect(() => readConversation(db,bob,m.conversationId,0,30)).toThrow('NOT_FOUND');
    expect(listInbox(db,bob,0,30).items).toEqual([]);
  });
  it('preserves Unicode and shell text, and paginates without loss', () => {
    const text = 'नमस्ते\n$(touch /tmp/never) `echo no` <script>alert(1)</script>';
    sendMessage(db,alice,input(text)); sendMessage(db,alice,input('second'));
    const p = listInbox(db,bob,0,1);
    expect(p.items[0].body).toBe(text);
    expect(listInbox(db,bob,p.nextCursor!,1).items[0].body).toBe('second');
    expect(() => listInbox(db,bob,-1,30)).toThrow();
  });
  it('keeps messages and idempotency across restart', () => {
    const path = join(mkdtempSync(join(tmpdir(),'pingme-test-')),'data.db');
    const disk = openDatabase(path);
    for (const id of ['alice','bob']) disk.prepare('INSERT INTO users(id,handle,password_hash) VALUES(?,?,?)').run(id,id,'fixture');
    disk.prepare("INSERT INTO contacts(a,b,state) VALUES('alice','bob','accepted')").run();
    const i = input(); const m = sendMessage(disk,alice,i); disk.close();
    const reopened = openDatabase(path);
    expect(sendMessage(reopened,alice,i).id).toBe(m.id);
    expect(listInbox(reopened,bob,0,30).items).toHaveLength(1); reopened.close();
  });
});
