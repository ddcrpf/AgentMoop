import { useAuth } from '@clerk/react';
import { useCallback } from 'react';
export class ApiError extends Error{constructor(public status:number,public code:string){super(code);}}
export function useApi(){
  const {getToken}=useAuth();
  return useCallback(async <T,>(path:string,init:{method?:string;body?:unknown}={})=>{
    const token=await getToken();
    const res=await fetch(path,{method:init.method??(init.body===undefined?'GET':'POST'),headers:{Authorization:`Bearer ${token}`,...(init.body===undefined?{}:{'Content-Type':'application/json'})},body:init.body===undefined?undefined:JSON.stringify(init.body)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new ApiError(res.status,String(data.error??'REQUEST_FAILED'));
    return data as T;
  },[getToken]);
}
export function useBlob(){
  const {getToken}=useAuth();
  return useCallback(async(path:string)=>{
    const res=await fetch(path,{headers:{Authorization:`Bearer ${await getToken()}`}});
    if(!res.ok)throw new ApiError(res.status,'ATTACHMENT_UNAVAILABLE');
    return res.blob();
  },[getToken]);
}
