import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
export function createUser(db:DatabaseSync,handle:string,clerkUserId='clerk_'+handle){
  const id=randomUUID();db.prepare("INSERT INTO users(id,handle,password_hash,clerk_user_id) VALUES(?,?,'',?)").run(id,handle,clerkUserId);return id;
}
export function befriend(db:DatabaseSync,x:string,y:string){
  const [a,b]=[x,y].sort();db.prepare("INSERT INTO contacts(a,b,state,requested_by) VALUES(?,?,'accepted',?)").run(a,b,x);
}
export const bearer=(handle:string)=>({Authorization:'Bearer test:clerk_'+handle});
