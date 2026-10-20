import { statfsSync } from 'node:fs';
import type { RequestHandler } from 'express';
export const DISK_HIGH=0.7;
export function usedFraction(s:{blocks:number;bavail:number}){
  if(!(s.blocks>0))throw new Error('statfs reported no blocks');
  return 1-s.bavail/s.blocks;
}
export function diskUsedFraction(dir:string){return usedFraction(statfsSync(dir));}
/** Liveness plus disk pressure; the uptime check alerts on anything but status ok. */
export function healthRoute(diskUsed:()=>number):RequestHandler{
  return (_req,res)=>{
    let disk:'ok'|'high'|'unknown';
    try{disk=diskUsed()>=DISK_HIGH?'high':'ok';}catch{disk='unknown';}
    res.json({status:disk==='ok'?'ok':'degraded',disk});
  };
}
