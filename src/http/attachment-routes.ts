import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { member } from '../auth/clerk.js';
import { AppError } from './errors.js';
import { readAttachment, deleteAttachment } from '../attachments/store.js';
export function attachmentRoutes(db:DatabaseSync,dir:string){
  const r=Router();const uuid=z.string().uuid();
  const id=(raw:unknown)=>{const p=uuid.safeParse(raw);if(!p.success)throw new AppError('NOT_FOUND',404);return p.data;};
  const disposition=(name:string)=>`attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}`;
  r.get('/api/attachments/:id',(req,res)=>{
    const {meta,bytes}=readAttachment(db,dir,member(res).userId,id(req.params.id));
    const image=meta.mediaType.startsWith('image/');
    res.set({'Content-Type':image?meta.mediaType:'text/plain; charset=utf-8','Content-Disposition':image?'inline':disposition(meta.filename),'Content-Length':String(bytes.length)});
    res.send(bytes);
  });
  r.post('/api/attachments/:id/delete',(req,res)=>{deleteAttachment(db,dir,member(res).userId,id(req.params.id));res.json({ok:true});});
  return r;
}
