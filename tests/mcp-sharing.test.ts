import { afterEach, beforeEach, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { fixture } from './fixtures/http.js';
import { createUser, befriend } from './fixtures/users.js';
import { issueToken } from '../src/auth/tokens.js';
let f:Awaited<ReturnType<typeof fixture>>;const clients:Client[]=[];
beforeEach(async()=>{f=await fixture();});afterEach(async()=>{for(const c of clients.splice(0))await c.close();await f.close();});
async function connect(userId:string){const t=issueToken(f.db,userId,'messages','t');const c=new Client({name:'t',version:'1'});await c.connect(new StreamableHTTPClientTransport(new URL(f.url+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+t.token}}}));clients.push(c);return c;}
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(200000,3)]);
const call=async(c:Client,name:string,args:Record<string,unknown>)=>{const r=await c.callTool({name,arguments:args});return {r,data:r.structuredContent as any};};
it('uploads in chunks, sends with the text, and the friend\'s agent can open it',async()=>{
  const a=createUser(f.db,'alice'),b=createUser(f.db,'bob'),e=createUser(f.db,'eve');befriend(f.db,a,b);
  const ac=await connect(a),bc=await connect(b),ec=await connect(e);
  const start=await call(ac,'upload_start',{filename:'shot.png',media_type:'image/png',size:PNG.length,sha256:createHash('sha256').update(PNG).digest('hex')});
  const {upload_id,chunk_bytes}=start.data;
  for(let off=0;off<PNG.length;off+=chunk_bytes)await call(ac,'upload_chunk',{upload_id,offset:off,data:PNG.subarray(off,off+chunk_bytes).toString('base64')});
  const {data:{attachment}}=await call(ac,'upload_finish',{upload_id});
  const sent=await call(ac,'send_message',{to:'bob',body:'check this out',attachment_id:attachment.id,client_message_id:randomUUID()});
  expect(sent.r.isError).not.toBe(true);
  const inbox=await call(bc,'list_inbox',{});
  expect(inbox.data.items[0]).toMatchObject({body:'check this out',attachment:{filename:'shot.png'}});
  const contacts=await call(bc,'list_contacts',{});
  expect(contacts.data.contacts).toEqual([expect.objectContaining({id:a,handle:'alice',unread:1,conversationId:expect.any(String)})]);
  const opened=await bc.callTool({name:'get_attachment',arguments:{attachment_id:attachment.id}});
  expect((opened.content as any[]).some(b=>b.type==='image'&&b.mimeType==='image/png')).toBe(true);
  expect((await ec.callTool({name:'get_attachment',arguments:{attachment_id:attachment.id}})).isError).toBe(true);
});
it('shares a labelled summary',async()=>{
  const a=createUser(f.db,'alice'),b=createUser(f.db,'bob');befriend(f.db,a,b);
  const ac=await connect(a),bc=await connect(b);
  await call(ac,'share_context',{to:'bob',kind:'summary',body:'Setup in 3 steps.',source_name:'README.md',client_message_id:randomUUID()});
  expect((await call(bc,'list_inbox',{})).data.items[0]).toMatchObject({kind:'summary',sourceName:'README.md'});
});
