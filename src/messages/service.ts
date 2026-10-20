import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../db/open.js';
import { AppError } from '../http/errors.js';
import { rateLimit } from '../auth/rate-limit.js';
import { publish } from '../events/bus.js';
import { pageSchema, sendSchema, replySchema, shareSchema, type SendInput, type ReplyInput, type ShareInput } from './schemas.js';
import { requireUser, requireContact, requireConversation, getMessage, selection, toMessage } from './queries.js';
import type { Message, Principal, Page } from './types.js';
function oldAttachmentId(db: DatabaseSync, id: number) {
  const r = db.prepare('SELECT attachment_id FROM messages WHERE id=?').get(id);
  return r?.attachment_id == null ? null : String(r.attachment_id);
}
function requireAttachment(db: DatabaseSync, p: Principal, id: string) {
  const att = db.prepare("SELECT id FROM attachments WHERE id=? AND uploader_id=? AND status='ready' AND expires_at>? AND NOT EXISTS (SELECT 1 FROM messages WHERE attachment_id=attachments.id)").get(id, p.userId, Date.now());
  if (!att) throw new AppError('ATTACHMENT_UNAVAILABLE');
}
function persist(db: DatabaseSync, p: Principal, data: SendInput & { kind?: 'text' | 'summary' | 'context'; source_name?: string }, replyTo: number | null): Message {
  requireUser(db,p);
  const other = db.prepare('SELECT id FROM users WHERE handle=? AND active=1').get(data.to);
  if (!other) throw new AppError('NOT_FOUND',404);
  const recipientId = String(other.id);
  const [a,b] = requireContact(db,p.userId,recipientId);
  const old = db.prepare('SELECT id FROM messages WHERE sender_id=? AND client_message_id=?').get(p.userId,data.client_message_id);
  if (old) {
    const m = getMessage(db,Number(old.id));
    if (m.recipientId !== recipientId || m.body !== data.body || m.context !== (data.context ?? null) || m.replyTo !== replyTo || m.kind !== (data.kind ?? 'text') || m.sourceName !== (data.source_name ?? null) || oldAttachmentId(db,m.id) !== (data.attachment_id ?? null)) throw new AppError('IDEMPOTENCY_CONFLICT',409);
    return m;
  }
  if (data.attachment_id) requireAttachment(db,p,data.attachment_id);
  rateLimit(db,'send:'+p.userId,30);
  db.prepare('INSERT INTO conversations(id,a,b) VALUES(?,?,?) ON CONFLICT(a,b) DO NOTHING').run(randomUUID(),a,b);
  const c = db.prepare('SELECT id FROM conversations WHERE a=? AND b=?').get(a,b)!;
  const result = db.prepare('INSERT INTO messages(conversation_id,sender_id,recipient_id,body,context,reply_to,client_message_id,created_at,attachment_id,kind,source_name) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(String(c.id),p.userId,recipientId,data.body,data.context??null,replyTo,data.client_message_id,new Date().toISOString(),data.attachment_id??null,data.kind??'text',data.source_name??null);
  const id = Number(result.lastInsertRowid);
  db.prepare('INSERT INTO deliveries(message_id,user_id) VALUES(?,?)').run(id,recipientId);
  return getMessage(db,id);
}
function announce(m: Message) {
  publish([m.senderId,m.recipientId],{type:'message.created',conversationId:m.conversationId,messageId:m.id}); return m;
}
export function sendMessage(db: DatabaseSync, p: Principal, input: SendInput) {
  const data = sendSchema.parse(input); return announce(transaction(db,() => persist(db,p,data,null)));
}
export function reply(db: DatabaseSync, p: Principal, input: ReplyInput) {
  const data = replySchema.parse(input);
  return announce(transaction(db,() => {
    requireUser(db,p); const parent = getMessage(db,data.message_id);
    if (!parent) throw new AppError('NOT_FOUND',404);
    const other = requireConversation(db,p,parent.conversationId);
    const user = db.prepare('SELECT handle FROM users WHERE id=?').get(other)!;
    return persist(db,p,{to:String(user.handle),body:data.body,context:data.context,attachment_id:data.attachment_id,client_message_id:data.client_message_id},parent.id);
  }));
}
function page(rows: Message[], limit: number): Page<Message> {
  const more = rows.length > limit; const items = rows.slice(0,limit);
  return {items,nextCursor:more ? items.at(-1)!.id : null};
}
export function listInbox(db: DatabaseSync, p: Principal, afterId = 0, limit = 30) {
  requireUser(db,p); const args = pageSchema.parse({after_id:afterId,limit});
  const rows = db.prepare(selection+` JOIN conversations c ON c.id=m.conversation_id JOIN contacts ct ON ct.a=c.a AND ct.b=c.b WHERE m.recipient_id=? AND m.id>? AND ct.state='accepted' AND u.active=1 ORDER BY m.id LIMIT ?`).all(p.userId,args.after_id,args.limit+1).map(toMessage);
  return page(rows,args.limit);
}
export function readConversation(db: DatabaseSync, p: Principal, conversationId: string, afterId = 0, limit = 30) {
  requireConversation(db,p,conversationId); const args = pageSchema.parse({after_id:afterId,limit});
  return page(db.prepare(selection+' WHERE m.conversation_id=? AND m.id>? ORDER BY m.id LIMIT ?').all(conversationId,args.after_id,args.limit+1).map(toMessage),args.limit);
}
export function shareContext(db: DatabaseSync, p: Principal, input: ShareInput) {
  const data = shareSchema.parse(input);
  return announce(transaction(db,() => persist(db,p,{to:data.to,body:data.body,client_message_id:data.client_message_id,kind:data.kind,source_name:data.source_name},null)));
}
