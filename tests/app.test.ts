import { afterEach, beforeEach, expect, it } from 'vitest';
import { fixture } from './fixtures/http.js';
let f:Awaited<ReturnType<typeof fixture>>;
beforeEach(async()=>{f=await fixture();});afterEach(async()=>{await f.close();});
it('allows Clerk in the CSP and no longer serves legacy pages',async()=>{
  const r=await fetch(f.url+'/healthz');
  expect(r.headers.get('content-security-policy')).toContain('https://example.clerk.accounts.dev');
  expect(r.headers.get('content-security-policy')).toMatch(/script-src [^;]*https:\/\/\*\.protect\.clerk\.com:\*/);
  expect(r.headers.get('content-security-policy')).toMatch(/connect-src [^;]*https:\/\/\*\.protect\.clerk\.com:\*/);
  for(const path of ['/login','/join','/contacts'])expect((await fetch(f.url+path,{headers:{Accept:'application/json'}})).status).toBe(404);
});
it('healthz reports disk pressure and survives an unreadable disk',async()=>{
  for(const [diskUsed,body] of [
    [()=>0.5,{status:'ok',disk:'ok'}],
    [()=>0.7,{status:'degraded',disk:'high'}],
    [()=>{throw new Error('statfs failed');},{status:'degraded',disk:'unknown'}],
  ] as const){
    const g=await fixture({diskUsed});
    try{
      const res=await fetch(g.url+'/healthz');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(body);
    }finally{await g.close();}
  }
});
