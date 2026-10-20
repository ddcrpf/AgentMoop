import { beforeEach, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openDatabase } from '../src/db/open.js';
import { startUpload, appendChunk, finishUpload } from '../src/attachments/store.js';
import { sendMessage, reply, listInbox, shareContext } from '../src/messages/service.js';
import { createUser, befriend } from './fixtures/users.js';
let db:ReturnType<typeof openDatabase>,dir:string,a:string,b:string;
const pa=()=>({userId:a,connectionId:'t',scopes:['messages']}),pb=()=>({userId:b,connectionId:'t',scopes:['messages']});
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(64,1)]);
beforeEach(()=>{db=openDatabase(':memory:');dir=mkdtempSync(join(tmpdir(),'pingme-msg-'));a=createUser(db,'alice');b=createUser(db,'bob');befriend(db,a,b);});
function uploaded(user:string){
  const {upload_id}=startUpload(db,dir,user,{filename:'shot.png',media_type:'image/png',size:PNG.length,sha256:createHash('sha256').update(PNG).digest('hex')});
  appendChunk(db,dir,user,{upload_id,offset:0,data:PNG.toString('base64')});return finishUpload(db,dir,user,upload_id).id;
}
it('sends one attachment with the text, idempotently, and shows it in the inbox',()=>{
  const att=uploaded(a),cid=randomUUID();
  const m=sendMessage(db,pa(),{to:'bob',body:'check this out',attachment_id:att,client_message_id:cid});
  expect(m.attachment).toMatchObject({id:att,filename:'shot.png',mediaType:'image/png'});
  expect(sendMessage(db,pa(),{to:'bob',body:'check this out',attachment_id:att,client_message_id:cid}).id).toBe(m.id);
  expect(()=>sendMessage(db,pa(),{to:'bob',body:'check this out',client_message_id:cid})).toThrow('IDEMPOTENCY_CONFLICT');
  expect(()=>sendMessage(db,pa(),{to:'bob',body:'again',attachment_id:att,client_message_id:randomUUID()})).toThrow('ATTACHMENT_UNAVAILABLE');
  expect(listInbox(db,pb(),0,30).items[0]).toMatchObject({kind:'text',attachment:{id:att}});
});
it('refuses someone else\'s or unfinished uploads, and replies can carry a file',()=>{
  const bobs=uploaded(b);
  expect(()=>sendMessage(db,pa(),{to:'bob',body:'x',attachment_id:bobs,client_message_id:randomUUID()})).toThrow('ATTACHMENT_UNAVAILABLE');
  const {upload_id}=startUpload(db,dir,a,{filename:'p.png',media_type:'image/png',size:PNG.length,sha256:'0'.repeat(64)});
  expect(()=>sendMessage(db,pa(),{to:'bob',body:'x',attachment_id:upload_id,client_message_id:randomUUID()})).toThrow('ATTACHMENT_UNAVAILABLE');
  const first=sendMessage(db,pa(),{to:'bob',body:'hi',client_message_id:randomUUID()});
  const r=reply(db,pb(),{message_id:first.id,body:'here',attachment_id:bobs,client_message_id:randomUUID()});
  expect(r.attachment?.id).toBe(bobs);
});
it('labels generated summaries and context packets',()=>{
  const s=shareContext(db,pa(),{to:'bob',kind:'summary',body:'README explains setup.',source_name:'README.md',client_message_id:randomUUID()});
  expect(s).toMatchObject({kind:'summary',sourceName:'README.md',attachment:null});
  expect(listInbox(db,pb(),0,30).items.map(i=>i.kind)).toEqual(['summary']);
  expect(()=>shareContext(db,pa(),{to:'bob',kind:'text' as never,body:'x',client_message_id:randomUUID()})).toThrow();
});
