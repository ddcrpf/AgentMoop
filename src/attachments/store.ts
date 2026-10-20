import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { AppError } from '../http/errors.js';
import { rateLimit } from '../auth/rate-limit.js';
export const LIMITS={maxBytes:10485760,chunkBytes:131072,ttlMs:30*86400000};
export const TYPES:Record<string,readonly string[]>={'image/png':['png'],'image/jpeg':['jpg','jpeg'],'image/webp':['webp'],'text/markdown':['md','markdown'],'text/plain':['txt']};
export type AttachmentMeta={id:string;filename:string;mediaType:string;size:number;expiresAt:string};
const STALE_UPLOAD_MS=3600000;
const fileOf=(dir:string,id:string)=>join(dir,id);
export const attachmentMeta=(r:Record<string,unknown>):AttachmentMeta=>({id:String(r.id),filename:String(r.filename),mediaType:String(r.media_type),size:Number(r.size),expiresAt:new Date(Number(r.expires_at)).toISOString()});
const FORBIDDEN_NAME_CHARS=/[\\/:\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\u061c\u180e\ufeff\u2044\u2215\uff0f]/;
const LONE_SURROGATE=/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
function cleanName(raw:unknown){
  if(typeof raw!=='string')throw new AppError('BAD_FILENAME');
  const name=raw.normalize('NFC');
  if(!name||LONE_SURROGATE.test(name)||name.length>120||FORBIDDEN_NAME_CHARS.test(name)||name.startsWith('.')||/[. ]$/.test(name)||name.lastIndexOf('.')<=0)throw new AppError('BAD_FILENAME');
  return name;
}
export function startUpload(db:DatabaseSync,dir:string,userId:string,input:{filename:string;media_type:string;size:number;sha256:string}){
  const filename=cleanName(input.filename);
  const ext=filename.split('.').pop()!.toLowerCase();
  if(!TYPES[input.media_type]?.includes(ext))throw new AppError('UNSUPPORTED_TYPE');
  if(!Number.isInteger(input.size)||input.size<1||input.size>LIMITS.maxBytes)throw new AppError('TOO_LARGE');
  if(!/^[0-9a-f]{64}$/.test(input.sha256))throw new AppError('BAD_CHUNK');
  rateLimit(db,'upload:'+userId,30,3600000);
  const id=randomUUID(),now=Date.now();
  mkdirSync(dir,{recursive:true,mode:0o700});writeFileSync(fileOf(dir,id),'',{mode:0o600});
  db.prepare("INSERT INTO attachments(id,uploader_id,filename,media_type,size,sha256,status,created_at,expires_at) VALUES(?,?,?,?,?,?,'uploading',?,?)").run(id,userId,filename,input.media_type,input.size,input.sha256,now,now+LIMITS.ttlMs);
  return {upload_id:id,chunk_bytes:LIMITS.chunkBytes};
}
function ownUpload(db:DatabaseSync,userId:string,id:string){
  const row=db.prepare("SELECT * FROM attachments WHERE id=? AND uploader_id=? AND status='uploading'").get(id,userId);
  if(!row)throw new AppError('NOT_FOUND',404);return row;
}
export function appendChunk(db:DatabaseSync,dir:string,userId:string,input:{upload_id:string;offset:number;data:string}){
  const row=ownUpload(db,userId,input.upload_id);
  const buf=Buffer.from(input.data,'base64');
  const received=Number(row.received);
  if(input.offset!==received||buf.length<1||buf.length>LIMITS.chunkBytes||received+buf.length>Number(row.size)||buf.toString('base64')!==input.data)throw new AppError('BAD_CHUNK');
  appendFileSync(fileOf(dir,input.upload_id),buf);
  db.prepare('UPDATE attachments SET received=? WHERE id=?').run(received+buf.length,input.upload_id);
  return {received:received+buf.length};
}
function contentMatches(mediaType:string,bytes:Buffer){
  if(mediaType==='image/png')return bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(mediaType==='image/jpeg')return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(mediaType==='image/webp')return bytes.subarray(0,4).toString('latin1')==='RIFF'&&bytes.subarray(8,12).toString('latin1')==='WEBP';
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return !text.includes('\u0000');}catch{return false;}
}
export function finishUpload(db:DatabaseSync,dir:string,userId:string,uploadId:string):AttachmentMeta{
  const row=ownUpload(db,userId,uploadId);
  if(Number(row.received)!==Number(row.size))throw new AppError('INCOMPLETE_UPLOAD');
  const bytes=readFileSync(fileOf(dir,uploadId));
  if(createHash('sha256').update(bytes).digest('hex')!==row.sha256){remove(db,dir,uploadId);throw new AppError('CHECKSUM_MISMATCH');}
  if(!contentMatches(String(row.media_type),bytes)){remove(db,dir,uploadId);throw new AppError('CONTENT_MISMATCH');}
  db.prepare("UPDATE attachments SET status='ready' WHERE id=?").run(uploadId);
  return attachmentMeta({...row,status:'ready'});
}
export function readAttachment(db:DatabaseSync,dir:string,userId:string,id:string){
  const row=db.prepare(`SELECT a.*,u.handle AS sender_handle FROM attachments a JOIN messages m ON m.attachment_id=a.id JOIN users u ON u.id=m.sender_id
    JOIN contacts c ON c.a=CASE WHEN m.sender_id<m.recipient_id THEN m.sender_id ELSE m.recipient_id END AND c.b=CASE WHEN m.sender_id<m.recipient_id THEN m.recipient_id ELSE m.sender_id END
    WHERE a.id=? AND a.uploader_id=m.sender_id AND a.status='ready' AND a.expires_at>? AND c.state='accepted' AND (m.sender_id=? OR m.recipient_id=?)`).get(id,Date.now(),userId,userId);
  if(!row)throw new AppError('NOT_FOUND',404);
  let bytes:Buffer;
  try{bytes=readFileSync(fileOf(dir,id));}catch{throw new AppError('NOT_FOUND',404);}
  return {meta:attachmentMeta(row),bytes,senderHandle:String(row.sender_handle)};
}
function remove(db:DatabaseSync,dir:string,id:string){
  db.prepare("UPDATE attachments SET status='deleted' WHERE id=?").run(id);
  rmSync(fileOf(dir,id),{force:true});
}
export function deleteAttachment(db:DatabaseSync,dir:string,userId:string,id:string){
  if(!db.prepare("SELECT id FROM attachments WHERE id=? AND uploader_id=? AND status!='deleted'").get(id,userId))throw new AppError('NOT_FOUND',404);
  remove(db,dir,id);
}
export function sweepAttachments(db:DatabaseSync,dir:string,now=Date.now()){
  const rows=db.prepare("SELECT id FROM attachments WHERE status!='deleted' AND (expires_at<=? OR (status='uploading' AND created_at<=?) OR (status='ready' AND created_at<=? AND NOT EXISTS (SELECT 1 FROM messages WHERE attachment_id=attachments.id)))").all(now,now-STALE_UPLOAD_MS,now-STALE_UPLOAD_MS);
  for(const r of rows)remove(db,dir,String(r.id));
  return rows.length;
}
