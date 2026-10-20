import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticateBearer } from '../auth/tokens.js';
import { createMcpServer } from './server.js';
import type { Config } from '../config.js';
export function mcpRoutes(db:DatabaseSync,config:Config,attachmentsDir:string){
  const router=Router();
  router.all('/mcp',async(req,res)=>{
    let principal;
    try{principal=authenticateBearer(db,(req.get('authorization')??'').replace(/^Bearer /,''),'messages');}
    catch{res.set('WWW-Authenticate',`Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource/mcp"`);res.status(401).json({error:'UNAUTHORIZED'});return;}
    if(req.get('origin')&&req.get('origin')!==config.baseUrl){res.status(403).json({error:'INVALID_ORIGIN'});return;}
    if(req.method!=='POST'){res.status(405).set('Allow','POST').end();return;}
    const server=createMcpServer(db,principal,attachmentsDir);
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{void transport.close();void server.close();});
    await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });return router;
}
