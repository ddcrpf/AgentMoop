import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidClientMetadataError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
export function clientsStore(db:DatabaseSync):OAuthRegisteredClientsStore {return {
  getClient(id) {const row=db.prepare('SELECT data FROM oauth_clients WHERE id=?').get(id);return row?JSON.parse(String(row.data)):undefined;},
  registerClient(data) {
    if (!data.redirect_uris.length||data.redirect_uris.length>10)throw new InvalidClientMetadataError('Supply one to ten redirect URLs');
    for(const raw of data.redirect_uris){const u=new URL(raw);if(u.username||u.password||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw new InvalidClientMetadataError('HTTPS or loopback redirects only');}
    const client:OAuthClientInformationFull={...data,client_id:randomUUID(),client_id_issued_at:Math.floor(Date.now()/1000),client_secret:undefined,client_secret_expires_at:undefined,token_endpoint_auth_method:'none',client_name:(data.client_name??'AI tool').slice(0,100),grant_types:['authorization_code','refresh_token'],response_types:['code']};
    db.prepare('INSERT INTO oauth_clients(id,data) VALUES(?,?)').run(client.client_id,JSON.stringify(client));return client;
  }
};}
