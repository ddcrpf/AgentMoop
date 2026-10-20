export type PingEvent={type:'message.created';conversationId:string;messageId:number}|{type:'request.created'|'request.accepted'|'contact.removed';userId:string};
const listeners=new Map<string,Set<(e:PingEvent)=>void>>();
export function subscribe(userId:string,listener:(e:PingEvent)=>void){
  const set=listeners.get(userId)??new Set();set.add(listener);listeners.set(userId,set);
  return ()=>{set.delete(listener);if(!set.size)listeners.delete(userId);};
}
export function publish(userIds:string[],event:PingEvent){
  for(const id of userIds)for(const listener of listeners.get(id)??[]){
    try{listener(event);}catch{/* committed work must not depend on listeners */}
  }
}
