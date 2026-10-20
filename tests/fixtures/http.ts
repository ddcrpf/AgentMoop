import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../src/db/open.js';
import { createApp } from '../../src/http/app.js';
import type { Config } from '../../src/config.js';
import type { AppDeps } from '../../src/http/app.js';
export async function fixture(extraDeps: Partial<AppDeps> = {}) {
  const db = openDatabase(':memory:');
  const server = createServer(); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const url = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const config: Config = { baseUrl:url, host:'127.0.0.1', port:0, dataDir:'.data', trustProxyHops:0, allowHttp:true, clerkSecretKey:null, clerkPublishableKey:'pk_test_'+Buffer.from('example.clerk.accounts.dev$').toString('base64') };
  const attachmentsDir = mkdtempSync(join(tmpdir(),'pingme-fx-'));
  server.on('request',createApp(config,db,{attachmentsDir,verifyClerk:async t=>t.startsWith('test:')?t.slice(5):null,...extraDeps}));
  return {db,url,server,config,attachmentsDir,close:async () => {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));db.close();rmSync(attachmentsDir,{recursive:true,force:true});}};
}
