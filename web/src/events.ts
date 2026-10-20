import { useAuth } from '@clerk/react';
import { useEffect, useRef } from 'react';
export type AppEvent={type:'message.created';conversationId:string;messageId:number}|{type:'request.created'|'request.accepted'|'contact.removed';userId:string}|{type:'reconnected'};
export function useEvents(onEvent:(e:AppEvent)=>void){
  const {getToken}=useAuth();const handler=useRef(onEvent);handler.current=onEvent;
  useEffect(()=>{
    const stop=new AbortController();
    const open=async(fresh:boolean)=>fetch('/api/events',{headers:{Authorization:`Bearer ${await getToken(fresh?{skipCache:true}:undefined)}`},signal:stop.signal});
    (async()=>{
      for(let first=true;!stop.signal.aborted;first=false){
        try{
          let res=await open(false);
          if(res.status===401)res=await open(true);
          if(res.status===401||res.status===403)return;
          if(!res.ok||!res.body)throw new Error('stream');
          if(!first)handler.current({type:'reconnected'});
          const reader=res.body.getReader();const dec=new TextDecoder();let buf='';
          for(;;){const {value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});
            let i;while((i=buf.indexOf('\n\n'))>=0){const chunk=buf.slice(0,i);buf=buf.slice(i+2);
              const line=chunk.split('\n').find(l=>l.startsWith('data: '));if(line)handler.current(JSON.parse(line.slice(6)));}}
        }catch{if(stop.signal.aborted)return;}
        await new Promise(r=>setTimeout(r,3000));
      }
    })();
    return ()=>stop.abort();
  },[getToken]);
}
