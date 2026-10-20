import type { DatabaseSync } from 'node:sqlite';
import type { Message, Principal } from './types.js';
import { attachmentMeta } from '../attachments/store.js';
import { AppError } from '../http/errors.js';
export const selection = `SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId, m.recipient_id AS recipientId, u.handle AS senderHandle, m.body, m.context, m.reply_to AS replyTo, m.created_at AS createdAt, m.kind, m.source_name AS sourceName,
  a.id AS att_id, a.filename AS att_filename, a.media_type AS att_media_type, a.size AS att_size, a.expires_at AS att_expires_at, a.status AS att_status
  FROM messages m JOIN users u ON u.id=m.sender_id LEFT JOIN attachments a ON a.id=m.attachment_id`;
export function toMessage(r: Record<string, unknown>): Message {
  const live = r.att_id && r.att_status === 'ready' && Number(r.att_expires_at) > Date.now();
  return { id: Number(r.id), conversationId: String(r.conversationId), senderId: String(r.senderId), recipientId: String(r.recipientId), senderHandle: String(r.senderHandle), body: String(r.body), context: r.context == null ? null : String(r.context), replyTo: r.replyTo == null ? null : Number(r.replyTo), createdAt: String(r.createdAt), kind: r.kind as Message['kind'], sourceName: r.sourceName == null ? null : String(r.sourceName),
    attachment: live ? attachmentMeta({ id: r.att_id, filename: r.att_filename, media_type: r.att_media_type, size: r.att_size, expires_at: r.att_expires_at }) : null };
}
export function requireUser(db: DatabaseSync, p: Principal) {
  if (!p.scopes.includes('messages') || !db.prepare('SELECT id FROM users WHERE id=? AND active=1').get(p.userId)) throw new AppError('UNAUTHORIZED',401);
}
export function requireContact(db: DatabaseSync, a: string, b: string) {
  const pair = [a,b].sort();
  if (!db.prepare("SELECT a FROM contacts JOIN users u ON u.id=? AND u.active=1 WHERE a=? AND b=? AND state='accepted'").get(b,...pair)) throw new AppError('NOT_FOUND',404);
  return pair;
}
export function requireConversation(db: DatabaseSync, p: Principal, id: string) {
  requireUser(db,p);
  const c = db.prepare('SELECT a,b FROM conversations WHERE id=? AND (a=? OR b=?)').get(id,p.userId,p.userId);
  if (!c) throw new AppError('NOT_FOUND',404);
  const other = String(c.a === p.userId ? c.b : c.a);
  requireContact(db,p.userId,other); return other;
}
export function getMessage(db: DatabaseSync, id: number) { const r = db.prepare(selection + ' WHERE m.id=?').get(id); return r ? toMessage(r) : (undefined as unknown as Message); }
