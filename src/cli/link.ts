import type { DatabaseSync } from 'node:sqlite';
import { AppError } from '../http/errors.js';
export function linkClerk(db:DatabaseSync,handle:string,clerkUserId:string){
  const u=db.prepare('SELECT id,clerk_user_id FROM users WHERE handle=?').get(handle);
  if(!u)throw new AppError('NOT_FOUND',404);
  if(u.clerk_user_id)throw new AppError('ALREADY_LINKED',409);
  if(db.prepare('SELECT id FROM users WHERE clerk_user_id=?').get(clerkUserId))throw new AppError('CLERK_ID_IN_USE',409);
  db.prepare('UPDATE users SET clerk_user_id=? WHERE id=?').run(clerkUserId,String(u.id));
}
export function grantAdmin(db:DatabaseSync,handle:string){
  if(!db.prepare('UPDATE users SET is_admin=1 WHERE handle=? AND active=1').run(handle).changes)throw new AppError('NOT_FOUND',404);
}
