import { Router } from 'express';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { authenticateBearer } from '../auth/tokens.js';
import { AppError } from '../http/errors.js';
export function deliveryRoutes(db:DatabaseSync){
  const r=Router();
  const pending=(user:string)=>db.prepare(`SELECT m.id AS messageId,m.conversation_id AS conversationId,u.handle AS senderHandle FROM deliveries d JOIN messages m ON m.id=d.message_id JOIN users u ON u.id=m.sender_id JOIN conversations c ON c.id=m.conversation_id JOIN contacts ct ON ct.a=c.a AND ct.b=c.b WHERE d.user_id=? AND d.status!='submitted' AND ct.state='accepted' AND u.active=1 ORDER BY d.status='failed',m.id LIMIT 30`).all(user);
  r.get('/api/deliveries',async(req,res)=>{
    const token=(req.get('authorization')??'').replace(/^Bearer /,'');
    const wait=z.coerce.number().int().min(0).max(25).parse(req.query.wait??25);const deadline=Date.now()+wait*1000;
    do{const p=authenticateBearer(db,token,'delivery');const items=pending(p.userId);if(items.length||Date.now()>=deadline){res.json({items});return;}
      await delay(200);
    }while(!res.destroyed);
  });
  r.post('/api/deliveries/:id/ack',(req,res)=>{
    const p=authenticateBearer(db,(req.get('authorization')??'').replace(/^Bearer /,''),'delivery');
    const id=z.coerce.number().int().positive().safe().parse(req.params.id);
    const input=z.object({status:z.enum(['submitted','failed']),error:z.string().max(200).optional()}).strict().parse(req.body);
    const row=db.prepare(`SELECT d.message_id FROM deliveries d JOIN messages m ON m.id=d.message_id JOIN conversations c ON c.id=m.conversation_id JOIN contacts ct ON ct.a=c.a AND ct.b=c.b WHERE d.message_id=? AND d.user_id=? AND ct.state='accepted'`).get(id,p.userId);
    if(!row)throw new AppError('NOT_FOUND',404);
    db.prepare("UPDATE deliveries SET status=?,error=?,submitted_at=? WHERE message_id=? AND user_id=? AND status!='submitted'").run(input.status,input.error??null,input.status==='submitted'?new Date().toISOString():null,id,p.userId);
    res.json({status:input.status});
  });return r;
}
