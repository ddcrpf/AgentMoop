import { z } from 'zod';
import { mkdirSync,readFileSync,writeFileSync,chmodSync,statSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { homedir } from 'node:os';
export const profileSchema=z.object({url:z.string().url().refine(raw=>{const u=new URL(raw);return !u.username&&!u.password&&!u.hash&&!u.search&&u.pathname==='/'&&(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)));}),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),defaultSession:z.string().uuid().optional(),bindings:z.record(z.string().uuid(),z.string().uuid()).default({})}).strict();
export type ReceiverConfig=z.infer<typeof profileSchema>;
export const defaultConfigPath=join(homedir(),'.config','agentmoop','receiver.json');
export function saveConfig(path:string,input:unknown){const config=profileSchema.parse(input);mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify(config,null,2),{mode:0o600});chmodSync(path,0o600);}
export function loadReceiverConfig(path=defaultConfigPath){if(process.platform!=='win32'&&(statSync(path).mode&0o077)!==0)throw new Error('Receiver config must be owner-only: chmod 600 '+path);return profileSchema.parse(JSON.parse(readFileSync(path,'utf8')));}
