import { beforeEach, expect, it } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db/open.js';
import { startUpload, appendChunk, finishUpload, readAttachment, deleteAttachment, sweepAttachments, LIMITS } from '../src/attachments/store.js';
import { createUser, befriend } from './fixtures/users.js';
let db:ReturnType<typeof openDatabase>,dir:string,a:string,b:string,e:string;
beforeEach(()=>{db=openDatabase(':memory:');dir=mkdtempSync(join(tmpdir(),'pingme-att-'));a=createUser(db,'alice');b=createUser(db,'bob');e=createUser(db,'eve');befriend(db,a,b);});
export const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(300,7)]);
const sha=(buf:Buffer)=>createHash('sha256').update(buf).digest('hex');
function upload(user:string,buf:Buffer,filename='shot.png',media_type='image/png'){
  const {upload_id,chunk_bytes}=startUpload(db,dir,user,{filename,media_type,size:buf.length,sha256:sha(buf)});
  for(let off=0;off<buf.length;off+=chunk_bytes)appendChunk(db,dir,user,{upload_id,offset:off,data:buf.subarray(off,off+chunk_bytes).toString('base64')});
  return finishUpload(db,dir,user,upload_id);
}
function attachTo(attId:string){
  db.prepare("INSERT INTO conversations(id,a,b) VALUES('c1',?,?)").run(...[a,b].sort());
  db.prepare("INSERT INTO messages(conversation_id,sender_id,recipient_id,body,client_message_id,created_at,attachment_id) VALUES('c1',?,?,'look',?,?,?)").run(a,b,randomUUID(),new Date().toISOString(),attId);
}
it('accepts a valid PNG in chunks and lets only sender and recipient read it',()=>{
  const big=Buffer.concat([PNG,Buffer.alloc(LIMITS.chunkBytes*2,1)]);
  const meta=upload(a,big);
  expect(meta).toMatchObject({filename:'shot.png',mediaType:'image/png',size:big.length});
  attachTo(meta.id);
  expect(readAttachment(db,dir,b,meta.id).bytes.equals(big)).toBe(true);
  expect(readAttachment(db,dir,a,meta.id).senderHandle).toBe('alice');
  expect(()=>readAttachment(db,dir,e,meta.id)).toThrow('NOT_FOUND');
  db.prepare("UPDATE contacts SET state='revoked'").run();
  expect(()=>readAttachment(db,dir,b,meta.id)).toThrow('NOT_FOUND');
});
it('rejects wrong types, disguised content, oversize, bad names and bad chunks',()=>{
  expect(()=>startUpload(db,dir,a,{filename:'x.gif',media_type:'image/gif',size:10,sha256:'0'.repeat(64)})).toThrow('UNSUPPORTED_TYPE');
  expect(()=>startUpload(db,dir,a,{filename:'x.png',media_type:'image/png',size:LIMITS.maxBytes+1,sha256:'0'.repeat(64)})).toThrow('TOO_LARGE');
  expect(()=>startUpload(db,dir,a,{filename:'x.txt',media_type:'image/png',size:10,sha256:'0'.repeat(64)})).toThrow('UNSUPPORTED_TYPE');
  expect(()=>startUpload(db,dir,a,{filename:'../etc/passwd.png',media_type:'image/png',size:10,sha256:'0'.repeat(64)})).toThrow('BAD_FILENAME');
  expect(()=>upload(a,Buffer.from('<html>hi</html>'),'fake.png')).toThrow('CONTENT_MISMATCH');
  expect(()=>upload(a,Buffer.from([0x68,0x00,0x69]),'notes.txt','text/plain')).toThrow('CONTENT_MISMATCH');
  const {upload_id}=startUpload(db,dir,a,{filename:'s.png',media_type:'image/png',size:PNG.length,sha256:sha(PNG)});
  expect(()=>appendChunk(db,dir,a,{upload_id,offset:5,data:PNG.toString('base64')})).toThrow('BAD_CHUNK');
  expect(()=>appendChunk(db,dir,b,{upload_id,offset:0,data:PNG.toString('base64')})).toThrow('NOT_FOUND');
  expect(()=>finishUpload(db,dir,a,upload_id)).toThrow('INCOMPLETE_UPLOAD');
  const bad=startUpload(db,dir,a,{filename:'t.png',media_type:'image/png',size:PNG.length,sha256:'f'.repeat(64)});
  appendChunk(db,dir,a,{upload_id:bad.upload_id,offset:0,data:PNG.toString('base64')});
  expect(()=>finishUpload(db,dir,a,bad.upload_id)).toThrow('CHECKSUM_MISMATCH');
});
it('accepts markdown text, deletes on request, and sweeps expired files',()=>{
  const md=upload(a,Buffer.from('# Title\nHello'),'README.md','text/markdown');
  attachTo(md.id);
  deleteAttachment(db,dir,a,md.id);
  expect(()=>readAttachment(db,dir,b,md.id)).toThrow('NOT_FOUND');
  expect(existsSync(join(dir,md.id))).toBe(false);
  const img=upload(a,PNG);
  expect(sweepAttachments(db,dir,Date.now()+LIMITS.ttlMs+1)).toBe(1);
  expect(existsSync(join(dir,img.id))).toBe(false);
});
it('sweeps finished-but-unsent uploads after an hour and keeps sent ones',()=>{
  const sent=upload(a,PNG);attachTo(sent.id);
  const unsent=upload(a,PNG,'two.png');
  expect(sweepAttachments(db,dir,Date.now()+3600000+1000)).toBe(1);
  expect(existsSync(join(dir,unsent.id))).toBe(false);
  expect(existsSync(join(dir,sent.id))).toBe(true);
});
it('refuses an attachment whose uploader is not the message sender',()=>{
  const meta=upload(e,PNG);attachTo(meta.id);
  expect(()=>readAttachment(db,dir,b,meta.id)).toThrow('NOT_FOUND');
});
it('rejects tricky filenames',()=>{
  for(const filename of ['a‮png.png','a​b.png','png','shot.png ','shot.png.','a:b.png','a∕b.png','a\u007f.png','a\u2060b.png','a\u061cb.png','a\u180eb.png','a\ud800b.png','a b.png',5 as unknown as string])
    expect(()=>startUpload(db,dir,a,{filename,media_type:'image/png',size:10,sha256:'0'.repeat(64)})).toThrow('BAD_FILENAME');
});
it('deletes the stored file when finish validation fails',()=>{
  const {upload_id}=startUpload(db,dir,a,{filename:'x.png',media_type:'image/png',size:PNG.length,sha256:'f'.repeat(64)});
  appendChunk(db,dir,a,{upload_id,offset:0,data:PNG.toString('base64')});
  expect(()=>finishUpload(db,dir,a,upload_id)).toThrow('CHECKSUM_MISMATCH');
  expect(existsSync(join(dir,upload_id))).toBe(false);
  expect(db.prepare('SELECT status FROM attachments WHERE id=?').get(upload_id)!.status).toBe('deleted');
});
it('returns NOT_FOUND when the stored file is missing',()=>{
  const meta=upload(a,PNG);attachTo(meta.id);rmSync(join(dir,meta.id));
  expect(()=>readAttachment(db,dir,b,meta.id)).toThrow('NOT_FOUND');
});
