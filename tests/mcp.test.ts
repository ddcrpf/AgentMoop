import { beforeEach, afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { fixture } from './fixtures/http.js';
import { createUser,befriend } from './fixtures/users.js';
import { issueToken,revokeConnection } from '../src/auth/tokens.js';
let f: Awaited<ReturnType<typeof fixture>>;
const clients: Client[]=[];
beforeEach(async()=>{f=await fixture();});afterEach(async()=>{for(const c of clients.splice(0))await c.close();await f?.close();});
async function person(handle:string,friend?:string) {
  const id=createUser(f.db,handle);if(friend)befriend(f.db,id,friend);const t=issueToken(f.db,id,'messages',handle);
  const c=new Client({name:'integration-test',version:'1.0'});
  await c.connect(new StreamableHTTPClientTransport(new URL(f.url+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+t.token}}}));clients.push(c);
  return {userId:id,...t,c};
}
it('exchanges messages through real SDK clients and isolates concurrent accounts',async()=>{
  const a=await person('alice'),b=await person('bob',a.userId),e=await person('eve');
  expect(a.c.getServerVersion()?.name).toBe('agentmoop');
  expect((await a.c.listTools()).tools).toHaveLength(10);
  expect((await a.c.listTools()).tools.map(t=>t.name).filter(n=>n.startsWith('sponsored_'))).toEqual([]);
  const old=await a.c.callTool({name:'sponsored_next',arguments:{}}).catch((e:unknown)=>({thrown:String(e)}));
  expect(JSON.stringify(old)).toMatch(/not found|isError|thrown/i);
  const sent=await a.c.callTool({name:'send_message',arguments:{to:'bob',body:'Hey, what’s up?',context:'Project discussion',client_message_id:randomUUID()}});
  expect(sent.isError).not.toBe(true);const m=(sent.structuredContent as any).message;
  const [bi,ei]=await Promise.all([b.c.callTool({name:'list_inbox',arguments:{}}),e.c.callTool({name:'list_inbox',arguments:{}})]);
  expect((bi.structuredContent as any).items[0].body).toBe('Hey, what’s up?');expect((ei.structuredContent as any).items).toEqual([]);
  expect((await e.c.callTool({name:'read_conversation',arguments:{conversation_id:m.conversationId}})).isError).toBe(true);
  const answer=await b.c.callTool({name:'reply',arguments:{message_id:m.id,body:'All good!',client_message_id:randomUUID()}});expect(answer.isError).not.toBe(true);
  expect(((await a.c.callTool({name:'list_inbox',arguments:{}})).structuredContent as any).items[0].body).toBe('All good!');
  revokeConnection(f.db,a.userId,a.connectionId);
  await expect(a.c.listTools()).rejects.toThrow();
});
it('advertises protected-resource metadata and rejects unauthenticated JSON-RPC',async()=>{
  const denied=await fetch(f.url+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  expect(denied.status).toBe(401);expect(denied.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
  const metadata=await fetch(f.url+'/.well-known/oauth-protected-resource/mcp');expect((await metadata.json()).resource).toBe(f.url+'/mcp');
});
