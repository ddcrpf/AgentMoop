import type { NextFunction, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { verifyToken } from '@clerk/backend';
import type { Config } from '../config.js';
import { AppError } from '../http/errors.js';
export type VerifyClerk=(token:string)=>Promise<string|null>;
export type Account={clerkUserId:string;userId:string|null;handle:string|null};
export function clerkVerifier(config:Config):VerifyClerk{
  return async token=>{
    if(!config.clerkSecretKey)return null;
    try{return (await verifyToken(token,{secretKey:config.clerkSecretKey,authorizedParties:[config.baseUrl]})).sub;}catch{return null;}
  };
}
export function clerkFrontendHost(publishableKey:string){
  return Buffer.from(publishableKey.replace(/^pk_(test|live)_/,''),'base64').toString('utf8').replace(/\$$/,'');
}
export function requireAccount(db:DatabaseSync,verify:VerifyClerk){
  return async (req:Request,res:Response,next:NextFunction)=>{
    const token=(req.get('authorization')??'').replace(/^Bearer /,'');
    const clerkUserId=token?await verify(token):null;
    if(!clerkUserId)return next(new AppError('UNAUTHORIZED',401));
    const u=db.prepare('SELECT id,handle FROM users WHERE clerk_user_id=? AND active=1').get(clerkUserId);
    res.locals.account={clerkUserId,userId:u?String(u.id):null,handle:u?String(u.handle):null} satisfies Account;next();
  };
}
export function requireMember(_req:Request,res:Response,next:NextFunction){
  if(!(res.locals.account as Account).userId)return next(new AppError('ONBOARDING_REQUIRED',403));next();
}
export const account=(res:Response)=>res.locals.account as Account;
export const member=(res:Response)=>({userId:account(res).userId!,handle:account(res).handle!});
