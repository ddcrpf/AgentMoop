import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { ReceiverConfig } from './config.js';
import { noticeSchema } from './codex.js';
import type { Notice,DeliveryResult } from '../messages/types.js';
export async function runReceiver(config:ReceiverConfig,signal:AbortSignal,submit:(notice:Notice)=>Promise<DeliveryResult>){
  let backoff=1000;const headers={Authorization:'Bearer '+config.token};
  while(!signal.aborted){
    try{
      const response=await fetch(config.url+'/api/deliveries?wait=25',{headers,signal:AbortSignal.any([signal,AbortSignal.timeout(35000)]),redirect:'error'});
      if(response.status===401)throw new Error('REVOKED');if(!response.ok)throw new Error('DELIVERY_UNAVAILABLE');
      const data=z.object({items:z.array(noticeSchema).max(30)}).strict().parse(await response.json());
      for(const item of data.items){
        if(signal.aborted)return;const result=await submit(item);
        const ack=await fetch(config.url+`/api/deliveries/${item.messageId}/ack`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(result),signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),redirect:'error'});
        if(ack.status===401)throw new Error('REVOKED');if(!ack.ok)throw new Error('ACK_FAILED');
      }
      backoff=1000;if(data.items.length)await delay(2000,undefined,{signal});
    }catch(error){if(signal.aborted)return;if(error instanceof Error&&error.message==='REVOKED')throw new Error('Receiver authorization expired or was revoked. Pair again from Connections.');
      process.stderr.write('AgentMoop delivery interrupted; retrying. Messages remain on the service.\n');await delay(backoff,undefined,{signal}).catch(()=>{});backoff=Math.min(backoff*2,30000);
    }
  }
}
