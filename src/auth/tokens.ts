import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { AppError } from '../http/errors.js';
import type { Principal } from '../messages/types.js';
export const secret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function issueToken(db: DatabaseSync,userId: string,scope: 'messages'|'delivery',label: string,clientId: string|null=null) {
  const connectionId=randomUUID();
  db.prepare('INSERT INTO connections(id,user_id,label,scope,client_id,created_at) VALUES(?,?,?,?,?,?)').run(connectionId,userId,label.slice(0,100),scope,clientId,new Date().toISOString());
  return {...mintAccess(db,connectionId,scope==='delivery' ? 7*86400000 : 3600000),connectionId};
}
export function mintAccess(db: DatabaseSync,connectionId: string,ttl=3600000) {
  const token=secret();
  db.prepare('INSERT INTO access_tokens(hash,connection_id,expires_at) VALUES(?,?,?)').run(digest(token),connectionId,Date.now()+ttl);
  return {token};
}
export function authenticateBearer(db: DatabaseSync,token: string,requiredScope: string): Principal {
  const row=db.prepare('SELECT c.* FROM access_tokens t JOIN connections c ON c.id=t.connection_id JOIN users u ON u.id=c.user_id WHERE t.hash=? AND t.expires_at>? AND c.revoked=0 AND u.active=1').get(digest(token),Date.now());
  if (!row || row.scope!==requiredScope) throw new AppError('UNAUTHORIZED',401);
  return {userId:String(row.user_id),connectionId:String(row.id),scopes:[String(row.scope)]};
}
export function revokeConnection(db: DatabaseSync,userId: string,id: string) {
  db.prepare('UPDATE connections SET revoked=1 WHERE id=? AND user_id=?').run(id,userId);
}
