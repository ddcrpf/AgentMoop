import { useState } from 'react';
export function Copy({text,label='Copy'}:{text:string;label?:string}){const [done,setDone]=useState('');
  return <div className="copy"><code>{text}</code><button className="secondary" onClick={()=>navigator.clipboard.writeText(text).then(()=>setDone('Copied'),()=>setDone('Select and copy'))}>{done||label}</button></div>;}
