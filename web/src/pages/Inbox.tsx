import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { MainContainer, Sidebar, ConversationList, Conversation, Avatar, ChatContainer, ConversationHeader, InputToolbox, MessageList, Message, MessageInput } from '@chatscope/chat-ui-kit-react';
import { useApi, ApiError } from '../api';
import { useEvents } from '../events';
import { AttachmentView, type Attachment } from '../components/AttachmentView';
type Friend={id:string;handle:string;conversationId:string|null;lastMessage:{body:string;senderHandle:string}|null;unread:number};
type Msg={id:number;conversationId:string;senderHandle:string;body:string;context:string|null;kind:'text'|'summary'|'context';sourceName:string|null;attachment:Attachment|null};
const initial=(h:string)=>`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="#0F766E"/><text x="20" y="26" font-size="18" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-weight="600">${h[0]!.toUpperCase()}</text></svg>`)}`;
export function Inbox({handle}:{handle:string}){
  const api=useApi();const navigate=useNavigate();const {conversationId}=useParams();
  const [friends,setFriends]=useState<Friend[]>([]);const [messages,setMessages]=useState<Msg[]>([]);const [selected,setSelected]=useState<Friend|null>(null);
  const [input,setInput]=useState('');const [error,setError]=useState('');const [ctx,setCtx]=useState('');const [showCtx,setShowCtx]=useState(false);const pending=useRef<{to:string;text:string;context:string;id:string}|null>(null);
  const loadFriends=useCallback(()=>api<{friends:Friend[]}>('/api/contacts').then(r=>{setFriends(r.friends);return r.friends;}),[api]);
  const openId=useRef<string|null>(null);const selectedRef=useRef<Friend|null>(null);selectedRef.current=selected;
  const loadMessages=useCallback(async(conv:string)=>{
    const all:Msg[]=[];let after=0;
    for(;;){const page=await api<{items:Msg[];nextCursor:number|null}>(`/api/conversations/${conv}/messages?after=${after}`);all.push(...page.items);if(page.nextCursor===null)break;after=page.nextCursor;}
    if(openId.current!==conv)return;setMessages(all);
    const last=all.at(-1);if(last)await api(`/api/conversations/${conv}/read`,{body:{last_read_id:last.id}});
    await loadFriends();
  },[api,loadFriends]);
  const refresh=useCallback((conv:string)=>{loadMessages(conv).catch(()=>{if(openId.current===conv)setError('Could not load messages.');});},[loadMessages]);
  useEffect(()=>{
    let live=true;openId.current=conversationId??null;setMessages([]);setError('');setInput('');setCtx('');pending.current=null;
    loadFriends().then(list=>{
      if(!live)return;const f=list.find(x=>x.conversationId===conversationId)??null;setSelected(f);
      if(f?.conversationId)refresh(f.conversationId);
    }).catch(()=>{if(live)setError('Could not load your friends.');});
    return()=>{live=false;};
  },[conversationId,loadFriends,refresh]);
  useEvents(e=>{
    if(e.type==='message.created'&&e.conversationId===openId.current)refresh(e.conversationId);
    else loadFriends().then(list=>{
      const cur=selectedRef.current;const f=cur&&!cur.conversationId?list.find(x=>x.id===cur.id):null;
      if(f?.conversationId)navigate('/inbox/'+f.conversationId);
    }).catch(()=>setError('Could not refresh your friends.'));
  });
  const sendError=(err:unknown)=>err instanceof ApiError?(err.code==='RATE_LIMITED'?'Slow down - try again in a minute.':err.code==='NOT_FOUND'?"You can't message this person right now.":'Not sent.'):'Not sent. Check your connection and press Enter to retry.';
  async function send(text:string){
    if(!selected||!text.trim())return;setError('');
    const p=pending.current;const id=p&&p.to===selected.handle&&p.text===text&&p.context===ctx?p.id:crypto.randomUUID();
    pending.current={to:selected.handle,text,context:ctx,id};
    try{const r=await api<{message:Msg}>('/api/messages',{body:{to:selected.handle,body:text,...(ctx.trim()?{context:ctx}:{}),client_message_id:id}});
      pending.current=null;setInput('');setCtx('');
      if(!selected.conversationId)navigate('/inbox/'+r.message.conversationId);else refresh(r.message.conversationId);}
    catch(err){if(err instanceof ApiError)pending.current=null;setError(sendError(err));}
  }
  return <div className={selected?'inbox inbox--open':'inbox'}><MainContainer responsive>
    <Sidebar position="left" scrollable>
      <ConversationList>{friends.length?friends.map(f=><Conversation key={f.id} name={'@'+f.handle} info={f.lastMessage?.body??'Say hello'} unreadCnt={f.unread} active={selected?.id===f.id}
        onClick={()=>f.conversationId?navigate('/inbox/'+f.conversationId):(setSelected(f),openId.current=null,setMessages([]),setError(''),setInput(''),setCtx(''),pending.current=null)}><Avatar src={initial(f.handle)} name={f.handle}/></Conversation>)
        :<p className="muted pad">Add friends from Home to start chatting.</p>}</ConversationList>
    </Sidebar>
    {selected?<ChatContainer>
      <ConversationHeader><ConversationHeader.Back onClick={()=>navigate('/inbox')}/><Avatar src={initial(selected.handle)} name={selected.handle}/><ConversationHeader.Content userName={'@'+selected.handle}/></ConversationHeader>
      <MessageList>{messages.map(m=><Message key={m.id} model={{direction:m.senderHandle===handle?'outgoing':'incoming',position:'single',type:'custom'}}>
        <Message.CustomContent>{m.kind==='summary'&&<span className="generated">AI summary of {m.sourceName??'a file'}</span>}{m.kind==='context'&&<span className="generated">Shared context</span>}<span className="body">{m.body}</span>{m.context&&<details className="context"><summary>Shared context</summary><pre>{m.context}</pre></details>}{m.attachment&&<AttachmentView attachment={m.attachment} mine={m.senderHandle===handle} onDeleted={()=>refresh(m.conversationId)}/>}</Message.CustomContent>
      </Message>)}{error&&<div role="alert" className="alert">{error}</div>}</MessageList>
      <InputToolbox><button type="button" className="secondary" aria-expanded={showCtx} onClick={()=>setShowCtx(v=>!v)}>Add context</button>{showCtx&&<label className="ctx">Shared context<textarea maxLength={32000} rows={3} value={ctx} onChange={e=>setCtx(e.target.value)}/></label>}</InputToolbox>
      <MessageInput placeholder="Type a message" value={input} onChange={html=>setInput(html)} attachButton={false} sendOnReturnDisabled={false} onSend={(_html,_text,innerText)=>send(innerText)}/>
    </ChatContainer>:<div className="empty muted">Choose a friend to start.</div>}
  </MainContainer></div>;
}
