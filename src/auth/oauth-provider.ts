import type { DatabaseSync } from 'node:sqlite';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidScopeError, InvalidTokenError, InvalidRequestError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { clientsStore } from './oauth-store.js';
import { authenticateBearer,digest,secret,issueToken,mintAccess } from './tokens.js';
import { transaction } from '../db/open.js';
import type { Config } from '../config.js';
export const OAUTH_COOKIE='agentmoop_oauth';
export function createProvider(db:DatabaseSync,config:Config):OAuthServerProvider {
  const resource=config.baseUrl+'/mcp';
  function checkResource(url?:URL){if(url&&url.href!==resource)throw new InvalidGrantError('Resource mismatch');}
  function getCode(client:OAuthClientInformationFull,code:string){
    const row=db.prepare('SELECT * FROM authorization_codes WHERE hash=? AND client_id=? AND expires_at>?').get(digest(code),client.client_id,Date.now());
    if(!row)throw new InvalidGrantError('Invalid or expired code');return {userId:String(row.user_id),params:JSON.parse(String(row.params)) as AuthorizationParams};
  }
  function pair(connectionId:string,access?:string){const refresh=secret();db.prepare('INSERT INTO refresh_tokens(hash,connection_id,expires_at) VALUES(?,?,?)').run(digest(refresh),connectionId,Date.now()+7*86400000);return {access_token:access??mintAccess(db,connectionId).token,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope:'messages'};}
  return {
    clientsStore:clientsStore(db),
    async authorize(client,params,res){
      checkResource(params.resource);
      if(!client.redirect_uris.includes(params.redirectUri)||!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge))throw new InvalidRequestError('Invalid redirect or PKCE challenge');
      if(params.scopes?.some(s=>s!=='messages'))throw new InvalidScopeError('Only messages scope is supported');
      const id=secret(),nonce=secret();
      db.prepare('INSERT INTO oauth_requests(id,session_hash,client_id,params,expires_at) VALUES(?,?,?,?,?)').run(id,digest(nonce),client.client_id,JSON.stringify({...params,resource,scopes:['messages']}),Date.now()+10*60000);
      res.cookie(OAUTH_COOKIE,nonce,{httpOnly:true,sameSite:'lax',secure:!config.allowHttp,path:'/api/oauth',maxAge:10*60000});
      res.redirect('/oauth/consent?request='+encodeURIComponent(id));
    },
    async challengeForAuthorizationCode(client,code){return getCode(client,code).params.codeChallenge;},
    async exchangeAuthorizationCode(client,code,_verifier,redirect,requestedResource){
      return transaction(db,()=>{
        const row=getCode(client,code);checkResource(requestedResource);
        if(redirect!==row.params.redirectUri)throw new InvalidGrantError('Redirect mismatch');
        db.prepare('DELETE FROM authorization_codes WHERE hash=?').run(digest(code));
        const issued=issueToken(db,row.userId,'messages',client.client_name??'AI tool',client.client_id);
        return pair(issued.connectionId,issued.token);
      });
    },
    async exchangeRefreshToken(client,token,scopes,requestedResource){
      checkResource(requestedResource);if(scopes?.some(s=>s!=='messages'))throw new InvalidScopeError('Invalid scope');
      const row=db.prepare('SELECT t.*,c.client_id,c.revoked FROM refresh_tokens t JOIN connections c ON c.id=t.connection_id WHERE t.hash=?').get(digest(token));
      if(!row||row.client_id!==client.client_id)throw new InvalidGrantError('Invalid refresh token');
      if(row.used){db.prepare('UPDATE connections SET revoked=1 WHERE id=?').run(String(row.connection_id));throw new InvalidGrantError('Refresh reuse detected');}
      if(row.revoked||Number(row.expires_at)<=Date.now())throw new InvalidGrantError('Expired or revoked refresh token');
      return transaction(db,()=>{db.prepare('UPDATE refresh_tokens SET used=1 WHERE hash=?').run(digest(token));return pair(String(row.connection_id));});
    },
    async verifyAccessToken(token){try{const p=authenticateBearer(db,token,'messages');const row=db.prepare('SELECT c.client_id,t.expires_at FROM connections c JOIN access_tokens t ON t.connection_id=c.id WHERE t.hash=?').get(digest(token))!;return {token,clientId:String(row.client_id??''),scopes:p.scopes,resource:new URL(resource),expiresAt:Number(row.expires_at)/1000,extra:{userId:p.userId}};}catch{throw new InvalidTokenError('Invalid access token');}},
    async revokeToken(client,request){
      for(const table of ['access_tokens','refresh_tokens']){const row=db.prepare(`SELECT c.id FROM ${table} t JOIN connections c ON c.id=t.connection_id WHERE t.hash=? AND c.client_id=?`).get(digest(request.token),client.client_id);if(row)db.prepare('UPDATE connections SET revoked=1 WHERE id=?').run(String(row.id));}
    }
  };
}
