import type { Request, RequestHandler, Response } from 'express';
import { subscribe } from '../events/bus.js';
import { member } from '../auth/clerk.js';
export function eventsRoute(maxStreamMs:number):RequestHandler{
  return (_req:Request,res:Response)=>{
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});
    res.write('retry: 3000\n\n: ready\n\n');
    const send=(chunk:string)=>{if(!res.writableEnded&&!res.destroyed)res.write(chunk);};
    const off=subscribe(member(res).userId,e=>send(`data: ${JSON.stringify(e)}\n\n`));
    const ping=setInterval(()=>send(': ping\n\n'),25000);
    let released=false;
    const cleanup=()=>{if(released)return;released=true;off();clearInterval(ping);clearTimeout(end);};
    const end=setTimeout(()=>{cleanup();res.end();},maxStreamMs);
    res.on('close',cleanup);
  };
}
