import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../db/open.js';
import { AppError } from '../http/errors.js';
import { rateLimit } from '../auth/rate-limit.js';
import { handleSchema } from '../messages/schemas.js';
import { publish } from '../events/bus.js';
export type Person={id:string;handle:string};
export type Friend=Person&{conversationId:string|null;lastMessage:{body:string;senderHandle:string;createdAt:string}|null;unread:number};
const pairOf=(x:string,y:string)=>[x,y].sort() as [string,string];
export function normalizeTag(raw:string){
  const parsed=handleSchema.safeParse(raw.trim().replace(/^@/,'').toLowerCase());
  if(!parsed.success)throw new AppError('NO_SUCH_TAG',404);return parsed.data;
}
export function requestFriend(db:DatabaseSync,userId:string,rawTag:string){
  rateLimit(db,'request:'+userId,20,3600000);
  const tag=normalizeTag(rawTag);
  const r=transaction(db,()=>{
    const other=db.prepare('SELECT id FROM users WHERE handle=? AND active=1').get(tag);
    if(!other)throw new AppError('NO_SUCH_TAG',404);
    const otherId=String(other.id);if(otherId===userId)throw new AppError('CANNOT_ADD_YOURSELF');
    const [a,b]=pairOf(userId,otherId);
    const row=db.prepare('SELECT state,requested_by FROM contacts WHERE a=? AND b=?').get(a,b);
    if(row?.state==='accepted')return {status:'accepted' as const,otherId,changed:false};
    if(row&&(row.state==='pending'||row.state==='ignored')){
      if(row.requested_by===userId)return {status:'sent' as const,otherId,changed:false};
      db.prepare("UPDATE contacts SET state='accepted' WHERE a=? AND b=?").run(a,b);return {status:'accepted' as const,otherId,changed:true};
    }
    db.prepare("INSERT INTO contacts(a,b,state,requested_by) VALUES(?,?,'pending',?) ON CONFLICT(a,b) DO UPDATE SET state='pending',requested_by=excluded.requested_by").run(a,b,userId);
    return {status:'sent' as const,otherId,changed:true};
  });
  if(r.changed){
    if(r.status==='sent')publish([r.otherId],{type:'request.created',userId});else publish([r.otherId],{type:'request.accepted',userId});
  }
  return {status:r.status,otherId:r.otherId};
}
function answer(db:DatabaseSync,userId:string,otherId:string,state:'accepted'|'ignored'){
  const [a,b]=pairOf(userId,otherId);
  const changed=db.prepare("UPDATE contacts SET state=? WHERE a=? AND b=? AND state='pending' AND requested_by=?").run(state,a,b,otherId).changes;
  if(!changed)throw new AppError('NOT_FOUND',404);
}
export function acceptRequest(db:DatabaseSync,userId:string,otherId:string){
  answer(db,userId,otherId,'accepted');publish([otherId],{type:'request.accepted',userId});
}
export const ignoreRequest=(db:DatabaseSync,userId:string,otherId:string)=>answer(db,userId,otherId,'ignored');
export function disconnect(db:DatabaseSync,userId:string,otherId:string){
  const [a,b]=pairOf(userId,otherId);
  const changed=db.prepare("UPDATE contacts SET state='revoked' WHERE a=? AND b=? AND state='accepted'").run(a,b).changes;
  if(changed){publish([otherId],{type:'contact.removed',userId});publish([userId],{type:'contact.removed',userId:otherId});}
}
export function memberContacts(db:DatabaseSync,userId:string){
  const others=(where:string)=>db.prepare(`SELECT u.id,u.handle FROM contacts c JOIN users u ON u.id=CASE WHEN c.a=? THEN c.b ELSE c.a END WHERE (c.a=? OR c.b=?) AND u.active=1 AND ${where} ORDER BY u.handle`).all(userId,userId,userId,userId) as unknown as Person[];
  const incoming=others("c.state='pending' AND c.requested_by!=?");
  const outgoing=others("c.state IN ('pending','ignored') AND c.requested_by=?");
  const friends=db.prepare(`SELECT u.id,u.handle,cv.id AS conversationId,
      (SELECT json_object('body',m.body,'senderHandle',s.handle,'createdAt',m.created_at) FROM messages m JOIN users s ON s.id=m.sender_id WHERE m.conversation_id=cv.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=cv.id AND m.recipient_id=? AND m.id>COALESCE((SELECT last_read_id FROM conversation_reads r WHERE r.user_id=? AND r.conversation_id=cv.id),0)) AS unread
    FROM contacts c JOIN users u ON u.id=CASE WHEN c.a=? THEN c.b ELSE c.a END LEFT JOIN conversations cv ON cv.a=c.a AND cv.b=c.b
    WHERE (c.a=? OR c.b=?) AND c.state='accepted' AND u.active=1 ORDER BY u.handle`).all(userId,userId,userId,userId,userId)
    .map(r=>({id:String(r.id),handle:String(r.handle),conversationId:r.conversationId?String(r.conversationId):null,lastMessage:r.lastMessage?JSON.parse(String(r.lastMessage)):null,unread:Number(r.unread)})) as Friend[];
  return {friends,incoming,outgoing};
}
