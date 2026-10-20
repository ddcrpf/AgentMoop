import express from 'express';
import { mcpRoutes } from '../mcp/http.js';
import { deliveryRoutes } from '../delivery/routes.js';
import { join,resolve } from 'node:path';
import { ZodError } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { Config } from '../config.js';
import { security } from './security.js';
import { createProvider } from '../auth/oauth-provider.js';
import { apiRoutes } from './api-routes.js';
import { clerkVerifier,type VerifyClerk } from '../auth/clerk.js';
import { AppError } from './errors.js';
import { healthRoute,diskUsedFraction } from './health.js';
export type AppDeps={verifyClerk?:VerifyClerk;maxStreamMs?:number;attachmentsDir?:string;diskUsed?:()=>number};
export function createApp(config:Config,db:DatabaseSync,deps:AppDeps={}){
  const app=express();security(app,config);app.use(express.json({limit:'256kb'}),express.urlencoded({extended:false,limit:'256kb'}));
  const attachmentsDir=deps.attachmentsDir??join(config.dataDir,'attachments');
  const verify=deps.verifyClerk??clerkVerifier(config);
  const webDir=resolve('web/dist');
  app.get('/healthz',healthRoute(deps.diskUsed??(()=>diskUsedFraction(config.dataDir))));
  app.use(express.static(webDir,{index:false}));
  app.use('/claude-plugin',express.static(resolve('dist/claude-plugin'),{index:false}));
  app.use(mcpAuthRouter({provider:createProvider(db,config),issuerUrl:new URL(config.baseUrl),resourceServerUrl:new URL(config.baseUrl+'/mcp'),scopesSupported:['messages']}));
  app.use(mcpRoutes(db,config,attachmentsDir));
  app.use(deliveryRoutes(db));
  app.use(apiRoutes(db,config,verify,deps.maxStreamMs??600000,attachmentsDir));
  app.get(/^\/(?!api\/|mcp|\.well-known|claude-plugin).*/,(req,res,next)=>{
    if(!req.accepts('html'))return next();
    res.sendFile(join(webDir,'index.html'),err=>{if(err)next(new AppError('NOT_FOUND',404));});
  });
  app.use((_req,_res,next)=>next(new AppError('NOT_FOUND',404)));
  app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const status=err instanceof AppError?err.status:err instanceof ZodError?400:typeof err==='object'&&err&&'status' in err?Number(err.status):500;
    res.status(status).json({error:err instanceof AppError?err.message:status===400?'INVALID_INPUT':status===413?'MESSAGE_TOO_LARGE':'REQUEST_FAILED'});
  });return app;
}
