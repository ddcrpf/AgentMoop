export type Profile={firstName:string|null;lastName:string|null;username:string|null;email:string|null};

/** One lowercase word of 3-20 letters or digits, or null when nothing usable is left. */
function word(s:string|null){
  const w=(s??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,20);
  return w.length>=3?w:null;
}

/** One-word tag ideas from the person's own name and email, most personal first; the server keeps the free ones. */
export function tagCandidates(p:Profile,random:()=>number=Math.random){
  const first=word(p.firstName),last=word(p.lastName),local=word(p.email?.split('@')[0]?.split('+')[0]??null);
  const base=first??local??word(p.username);
  const digits=String(Math.floor(random()*100)).padStart(2,'0');
  const ideas=[first,first&&last?word(first+last):null,local,last,word(p.username),base?word(base+digits):null];
  return [...new Set(ideas.filter((t):t is string=>t!==null))];
}
