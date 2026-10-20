import { useEffect, useState } from 'react';
import { useApi, useBlob } from '../api';
export type Attachment={id:string;filename:string;mediaType:string;size:number;expiresAt:string};
export function AttachmentView({attachment,mine,onDeleted}:{attachment:Attachment;mine:boolean;onDeleted:()=>void}){
  const blob=useBlob(),api=useApi();
  const [file,setFile]=useState<Blob|null>(null);const [url,setUrl]=useState<string|null>(null);const [text,setText]=useState<string|null>(null);const [error,setError]=useState('');
  const image=attachment.mediaType.startsWith('image/');
  useEffect(()=>{let live=true,made:string|null=null;
    blob('/api/attachments/'+attachment.id).then(b=>{if(!live)return;made=URL.createObjectURL(b);setFile(b);setUrl(made);},()=>{if(live)setError('File unavailable.');});
    return ()=>{live=false;if(made)URL.revokeObjectURL(made);};},[attachment.id,blob]);
  const toggle=async()=>{if(text!==null){setText(null);return;}if(!file)return;try{setText((await file.text()).slice(0,4000));}catch{setError('Could not open the file.');}};
  const remove=()=>{if(window.confirm(`Delete ${attachment.filename} for both of you?`))api(`/api/attachments/${attachment.id}/delete`,{body:{}}).then(onDeleted,()=>setError('Could not delete the file.'));};
  const date=new Date(attachment.expiresAt);const expires=Number.isNaN(date.getTime())?'':date.toLocaleDateString();
  return <div className="attachment">
    {image?(url&&<a href={url} target="_blank" rel="noreferrer"><img src={url} alt={attachment.filename} className="attachment-img"/></a>)
      :<span className="attachment-file"><strong>{attachment.filename}</strong>{url&&<><button type="button" className="secondary" onClick={toggle}>{text===null?'Show file':'Hide file'}</button><a href={url} download={attachment.filename}>Download</a></>}</span>}
    {text!==null&&<pre className="attachment-text">{text}</pre>}
    {(error||expires||mine)&&<small className="attachment-note">{error&&<>{error} </>}{expires&&<>Expires {expires}</>}{mine&&<> <button type="button" className="link" onClick={remove}>Delete file</button></>}</small>}
  </div>;
}
