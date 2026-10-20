import { Router, type Request } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from '../db/open.js';
import { digest, secret } from '../auth/tokens.js';
import { member } from '../auth/clerk.js';
import { AppError } from './errors.js';
import { OAUTH_COOKIE } from '../auth/oauth-provider.js';
const nonceOf=(req:Request)=>(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(OAUTH_COOKIE+'='))?.slice(OAUTH_COOKIE.length+1)??'';
export function oauthConsentRoutes(db:DatabaseSync){
  const r=Router();
  const pending=(req:Request)=>{
    const row=db.prepare('SELECT a.*,c.data FROM oauth_requests a JOIN oauth_clients c ON c.id=a.client_id WHERE a.id=? AND a.session_hash=? AND a.expires_at>?').get(String(req.params.id),digest(nonceOf(req)),Date.now());
    if(!row)throw new AppError('AUTHORIZATION_EXPIRED');return row;
  };
  r.get('/api/oauth/requests/:id',(req,res)=>{
    const row=pending(req);res.json({clientName:String(JSON.parse(String(row.data)).client_name??'AI tool'),redirectOrigin:new URL(JSON.parse(String(row.params)).redirectUri).origin});
  });
  for(const decision of ['approve','deny'] as const)r.post(`/api/oauth/requests/:id/${decision}`,(req,res)=>{
    const redirect=transaction(db,()=>{
      const row=pending(req);const params=JSON.parse(String(row.params));const url=new URL(params.redirectUri);
      if(params.state)url.searchParams.set('state',params.state);
      if(decision==='approve'){const code=secret();db.prepare('INSERT INTO authorization_codes(hash,user_id,client_id,params,expires_at) VALUES(?,?,?,?,?)').run(digest(code),member(res).userId,String(row.client_id),String(row.params),Date.now()+300000);url.searchParams.set('code',code);}
      else url.searchParams.set('error','access_denied');
      db.prepare('DELETE FROM oauth_requests WHERE id=?').run(String(req.params.id));return url.href;
    });
    res.clearCookie(OAUTH_COOKIE,{path:'/api/oauth'});res.json({redirect});
  });
  return r;
}
