import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { defaultConfigPath,loadReceiverConfig,saveConfig } from '../local/config.js';
import { runReceiver } from '../local/receiver.js';
import { submitCodexNotice } from '../local/codex.js';
const {values,positionals}=parseArgs({allowPositionals:true,options:{profile:{type:'string'},config:{type:'string'},thread:{type:'string'},conversation:{type:'string'}}});
const path=values.config??defaultConfigPath;
try{
  if(positionals[0]==='pair'){
    if(!values.profile)throw new Error('Usage: receiver pair --profile downloaded-profile.json --thread SESSION_UUID');
    const profile=JSON.parse(readFileSync(values.profile,'utf8'));
    saveConfig(path,{...profile,defaultSession:values.thread});process.stdout.write('Receiver paired. Run npm run receiver -- run to receive notices.\n');
  }else if(positionals[0]==='bind'){
    if(!values.thread||!values.conversation)throw new Error('Supply --conversation UUID and --thread UUID');
    const config=loadReceiverConfig(path);config.bindings[values.conversation]=values.thread;saveConfig(path,config);process.stdout.write('Conversation destination saved.\n');
  }else if(positionals[0]==='run'){
    const config=loadReceiverConfig(path);const stop=new AbortController();for(const s of ['SIGINT','SIGTERM'] as const)process.on(s,()=>stop.abort());
    await runReceiver(config,stop.signal,async notice=>{const session=config.bindings[notice.conversationId]??config.defaultSession;return session?submitCodexNotice(session,notice):{status:'failed',error:'Select a local destination with receiver bind.'};});
  }else throw new Error('Usage: receiver pair | bind | run');
}catch(error){process.stderr.write((error instanceof Error?error.message:'Receiver failed')+'\n');process.exitCode=1;}
