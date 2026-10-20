import { resolve } from 'node:path';
export type Config = {baseUrl:string; host:string; port:number; dataDir:string; trustProxyHops:number; allowHttp:boolean; clerkSecretKey:string|null; clerkPublishableKey:string|null};
export function loadConfig(env=process.env): Config {
  const allowHttp=env.ALLOW_HTTP_LOOPBACK==='true';
  const base=new URL(env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3434');
  if (base.username || base.password || base.search || base.hash || base.pathname!=='/') throw new Error('PUBLIC_BASE_URL must be an origin');
  if (base.protocol!=='https:' && !(allowHttp && base.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(base.hostname))) throw new Error('Use HTTPS or explicitly enable ALLOW_HTTP_LOOPBACK=true for local development');
  const port=Number(env.PORT??3434), hops=Number(env.TRUST_PROXY_HOPS??0);
  if (!Number.isInteger(port)||port<1||port>65535||!Number.isInteger(hops)||hops<0||hops>5) throw new Error('Invalid port or proxy configuration');
  return {baseUrl:base.origin,host:env.HOST??'127.0.0.1',port,dataDir:resolve(env.DATA_DIR??'.data'),trustProxyHops:hops,allowHttp,clerkSecretKey:env.CLERK_SECRET_KEY??null,clerkPublishableKey:env.CLERK_PUBLISHABLE_KEY??null};
}
