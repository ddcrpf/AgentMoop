import { Router, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { Config } from '../config.js';
import { handleSchema } from '../messages/schemas.js';
import { account, member, requireAccount, requireMember, type VerifyClerk } from '../auth/clerk.js';
import { memberContacts, requestFriend, acceptRequest, ignoreRequest, disconnect } from '../contacts/service.js';
import { sendMessage, readConversation } from '../messages/service.js';
import { requireConversation } from '../messages/queries.js';
import { issueToken, revokeConnection } from '../auth/tokens.js';
import { rateLimit } from '../auth/rate-limit.js';
import { AppError } from './errors.js';
import { eventsRoute } from './events-route.js';
import { oauthConsentRoutes } from './oauth-consent-routes.js';
import { attachmentRoutes } from './attachment-routes.js';
export function apiRoutes(db:DatabaseSync,config:Config,verify:VerifyClerk,maxStreamMs:number,attachmentsDir:string){
  const r=Router();
  r.get('/api/config',(_req,res)=>res.json({publishableKey:config.clerkPublishableKey}));
  r.use('/api',requireAccount(db,verify));
  r.get('/api/me',(_req,res)=>{res.json({handle:account(res).handle});});
  r.post('/api/me/handle-suggestions',(req,res)=>{
    const a=account(res);rateLimit(db,'tag-ideas:'+a.clerkUserId,20);
    const {candidates}=z.object({candidates:z.array(z.string().max(64)).max(12)}).strict().parse(req.body);
    const taken=db.prepare('SELECT 1 FROM users WHERE handle=?');
    const suggestions=[...new Set(candidates)].filter(c=>handleSchema.safeParse(c).success&&!taken.get(c)).slice(0,4);
    res.json({suggestions});
  });
  r.post('/api/me/handle',(req,res)=>{
    const a=account(res);if(a.userId)throw new AppError('ALREADY_ONBOARDED',409);
    const {handle}=z.object({handle:handleSchema}).strict().parse(req.body);
    if(db.prepare('SELECT id FROM users WHERE handle=?').get(handle))throw new AppError('HANDLE_UNAVAILABLE',409);
    db.prepare("INSERT INTO users(id,handle,password_hash,clerk_user_id) VALUES(?,?,'',?)").run(randomUUID(),handle,a.clerkUserId);
    res.status(201).json({handle});
  });
  r.use('/api',requireMember);
  r.use(attachmentRoutes(db,attachmentsDir));
  r.use(oauthConsentRoutes(db));
  r.get('/api/events',eventsRoute(maxStreamMs));
  const principal=(res:Response)=>({userId:member(res).userId,connectionId:'browser',scopes:['messages']});
  const id=z.string().uuid();
  r.get('/api/contacts',(_req,res)=>res.json(memberContacts(db,member(res).userId)));
  r.post('/api/requests',(req,res)=>{const {tag}=z.object({tag:z.string().max(64)}).strict().parse(req.body);res.json({status:requestFriend(db,member(res).userId,tag).status});});
  r.post('/api/requests/:userId/accept',(req,res)=>{acceptRequest(db,member(res).userId,id.parse(req.params.userId));res.json({ok:true});});
  r.post('/api/requests/:userId/ignore',(req,res)=>{ignoreRequest(db,member(res).userId,id.parse(req.params.userId));res.json({ok:true});});
  r.post('/api/contacts/:userId/disconnect',(req,res)=>{disconnect(db,member(res).userId,id.parse(req.params.userId));res.json({ok:true});});
  r.get('/api/conversations/:id/messages',(req,res)=>res.json(readConversation(db,principal(res),id.parse(req.params.id),z.coerce.number().int().nonnegative().safe().parse(req.query.after??0),100)));
  r.post('/api/messages',(req,res)=>res.json({message:sendMessage(db,principal(res),req.body)}));
  r.post('/api/conversations/:id/read',(req,res)=>{
    const conv=id.parse(req.params.id);requireConversation(db,principal(res),conv);
    const {last_read_id}=z.object({last_read_id:z.number().int().nonnegative().safe()}).strict().parse(req.body);
    db.prepare('INSERT INTO conversation_reads(user_id,conversation_id,last_read_id) VALUES(?,?,?) ON CONFLICT(user_id,conversation_id) DO UPDATE SET last_read_id=MAX(last_read_id,excluded.last_read_id)').run(member(res).userId,conv,last_read_id);
    res.json({ok:true});
  });
  r.get('/api/connections',(_req,res)=>res.json(db.prepare('SELECT id,label,scope,revoked,created_at FROM connections WHERE user_id=? ORDER BY created_at DESC').all(member(res).userId)));
  r.post('/api/connections/:id/revoke',(req,res)=>{revokeConnection(db,member(res).userId,String(req.params.id));res.json({ok:true});});
  r.post('/api/connections/device',(req,res)=>{
    rateLimit(db,'device:'+member(res).userId,10,3600000);const {label}=z.object({label:z.string().trim().min(1).max(100)}).strict().parse(req.body);
    const t=issueToken(db,member(res).userId,'delivery',label);res.json({profile:JSON.stringify({url:config.baseUrl,token:t.token},null,2)});
  });
  return r;
}
