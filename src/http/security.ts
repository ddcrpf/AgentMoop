import type { Express } from 'express';
import type { Config } from '../config.js';
import { clerkFrontendHost } from '../auth/clerk.js';
import { AppError } from './errors.js';
function contentPolicy(config:Config){
  const fapi=config.clerkPublishableKey?' https://'+clerkFrontendHost(config.clerkPublishableKey):'';
  // Clerk production instances run bot protection from *.protect.clerk.com, probing several ports.
  const protect='https://*.protect.clerk.com:*';
  return `default-src 'self'; script-src 'self'${fapi} https://challenges.cloudflare.com ${protect}; connect-src 'self'${fapi} ${protect}; img-src 'self' data: blob: https://img.clerk.com; style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'none'`;
}
export function security(app:Express,config:Config) {
  app.disable('x-powered-by');app.set('trust proxy',config.trustProxyHops);
  const policy=contentPolicy(config);
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':policy});
    if (!config.allowHttp) res.set('Strict-Transport-Security','max-age=31536000');
    if (req.get('host')!==new URL(config.baseUrl).host) return next(new AppError('INVALID_HOST',400));
    next();
  });
}
