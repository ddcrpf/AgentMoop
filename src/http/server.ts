import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/open.js';
import { createApp } from './app.js';
import { sweepAttachments } from '../attachments/store.js';
process.umask(0o077);
const config=loadConfig();const db=openDatabase(join(config.dataDir,'pingme.db'));
const attachmentsDir=join(config.dataDir,'attachments');
const sweep=()=>{try{sweepAttachments(db,attachmentsDir);}catch{process.stderr.write('Attachment cleanup failed; will retry.\n');}};
sweep();const sweeper=setInterval(sweep,3600000);sweeper.unref();
const server=createApp(config,db).listen(config.port,config.host,()=>process.stdout.write(`AgentMoop is listening at ${config.baseUrl}\n`));
server.on('error',()=>{process.stderr.write('Unable to start AgentMoop. Check the bind address, port and data directory.\n');db.close();process.exitCode=1;});
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{
 clearInterval(sweeper);server.close(()=>{db.close();process.exit(0);});setTimeout(()=>server.closeAllConnections(),1000).unref();
});
