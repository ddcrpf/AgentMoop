import { parseArgs } from 'node:util';
import { existsSync,chmodSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { backup } from 'node:sqlite';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/open.js';
import { linkClerk,grantAdmin } from './link.js';
process.umask(0o077);
const {values,positionals}=parseArgs({allowPositionals:true,options:{handle:{type:'string'},output:{type:'string'},'clerk-user':{type:'string'}}});
const config=loadConfig();const db=openDatabase(join(config.dataDir,'pingme.db'));
try{
 const command=positionals[0];
 if(command==='backup'){
  if(!values.output)throw new Error('Supply --output /path/to/new-backup.db');
  const output=resolve(values.output);if(existsSync(output))throw new Error('Output already exists; choose a new backup filename.');
  await backup(db,output);chmodSync(output,0o600);process.stdout.write('Database backup saved. Protect it like the live database.\n');
 }else if(command==='link'){
  if(!values.handle||!values['clerk-user'])throw new Error('Usage: admin link --handle NAME --clerk-user user_...');
  linkClerk(db,values.handle,values['clerk-user']);process.stdout.write('Linked.\n');
 }else if(command==='grant'){
  if(!values.handle)throw new Error('Usage: admin grant --handle NAME');
  grantAdmin(db,values.handle);process.stdout.write('Granted.\n');
 }else throw new Error('Usage: admin backup --output PATH | link --handle NAME --clerk-user ID | grant --handle NAME');
}catch(error){process.stderr.write((error instanceof Error?error.message:'Admin command failed')+'\n');process.exitCode=1;}finally{db.close();}
