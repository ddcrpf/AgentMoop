import { afterEach, beforeEach, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { EventEmitter, once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/http/app.js';
import { eventsRoute } from '../src/http/events-route.js';
import { publish } from '../src/events/bus.js';
import { createUser, befriend, bearer } from './fixtures/users.js';
let close:()=>Promise<void>,url:string,db:ReturnType<typeof openDatabase>;
beforeEach(async()=>{
  db=openDatabase(':memory:');const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  server.on('request',createApp({baseUrl:url,host:'127.0.0.1',port:0,dataDir:'.data',trustProxyHops:0,allowHttp:true,clerkSecretKey:null,clerkPublishableKey:null},db,{verifyClerk:async t=>t.startsWith('test:')?t.slice(5):null,maxStreamMs:400}));
  close=async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();};
});
afterEach(()=>close());
function openStream(handle:string,ms:number){
  const dec=new TextDecoder();let text='';let markReady!:()=>void;
  const ready=new Promise<void>(r=>{markReady=r;});
  const done=(async()=>{
    const res=await fetch(url+'/api/events',{headers:bearer(handle)});
    const reader=res.body!.getReader();
    const deadline=Date.now()+ms;
    while(Date.now()<deadline){
      const {value,done}=await reader.read();if(done)break;
      text+=dec.decode(value,{stream:true});
      if(text.includes(': ready'))markReady();
    }
    return {status:res.status,text};
  })();
  return {ready,done};
}
it('streams only your own events and ends after the maximum age',async()=>{
  const a=createUser(db,'alice'),b=createUser(db,'bob');createUser(db,'eve');befriend(db,a,b);
  const bobStream=openStream('bob',1000),eveStream=openStream('eve',1000);
  await Promise.all([bobStream.ready,eveStream.ready]);
  await fetch(url+'/api/messages',{method:'POST',headers:{...bearer('alice'),'Content-Type':'application/json'},body:JSON.stringify({to:'bob',body:'hi',client_message_id:randomUUID()})});
  const [bobOut,eveOut]=await Promise.all([bobStream.done,eveStream.done]);
  expect(bobOut.text).toContain(': ready');expect(bobOut.text).toContain('"type":"message.created"');
  expect(eveOut.text).not.toContain('message.created');
  expect((await fetch(url+'/api/events')).status).toBe(401);
});
it('releases its subscription and stops writing once the stream ends',async()=>{
  const bobId=createUser(db,'bob');
  const req=new EventEmitter();const res=new EventEmitter();
  const written:string[]=[];let ended=false;
  Object.assign(res,{
    locals:{account:{clerkUserId:'clerk_bob',userId:bobId,handle:'bob'}},
    writeHead:()=>undefined,
    write:(chunk:string)=>{written.push(chunk);return true;},
    end:()=>{ended=true;res.emit('close');},
  });
  eventsRoute(20)(req as unknown as Request,res as unknown as Response,()=>undefined);
  await new Promise(r=>setTimeout(r,60));
  expect(ended).toBe(true);
  const before=written.length;
  publish([bobId],{type:'contact.removed',userId:'eve-id'});
  expect(written.length).toBe(before);
});
