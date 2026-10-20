import { expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/open.js';
import { schema } from '../src/db/schema.js';
import { authSchema } from '../src/db/auth-schema.js';
import { migrateTo } from '../src/db/migrations.js';
function openDatabaseAtVersion3(path:string){
  const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');db.exec(schema);db.exec(authSchema);migrateTo(db,3);return db;
}
const columns=(db:DatabaseSync,t:string)=>db.prepare(`PRAGMA table_info(${t})`).all().map(r=>String(r.name));
it('upgrades a pre-V1 database in place and keeps its rows',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'pingme-mig-')),'old.db');
  const old=new DatabaseSync(path);
  old.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE contacts(a TEXT REFERENCES users(id), b TEXT REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('accepted','revoked')), PRIMARY KEY(a,b), CHECK(a<b));
    INSERT INTO users VALUES('u1','alice','h',1),('u2','bob','h',1); INSERT INTO contacts VALUES('u1','u2','accepted');`);
  old.close();
  const db=openDatabase(path);
  expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(4);
  expect(columns(db,'users')).toContain('clerk_user_id');
  expect(db.prepare("SELECT is_admin AS a FROM users WHERE id='u1'").get()).toEqual({a:0});
  expect(columns(db,'users')).not.toContain('sponsored_opt_in');
  expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ads','sponsors','ad_stats')").all()).toEqual([]);
  expect(columns(db,'contacts')).toEqual(expect.arrayContaining(['requested_by','invite_floor']));
  expect(db.prepare('SELECT state FROM contacts').get()!.state).toBe('accepted');
  db.prepare("INSERT INTO users(id,handle,password_hash) VALUES('u3','carol','')").run();
  db.prepare("INSERT INTO contacts(a,b,state,requested_by) VALUES('u1','u3','pending','u1')").run();
  expect(columns(db,'conversation_reads')).toEqual(['user_id','conversation_id','last_read_id']);
  db.close();
  expect(openDatabase(path).prepare('PRAGMA user_version').get()!.user_version).toBe(4);
});
it('rejects a duplicate Clerk id',()=>{
  const db=openDatabase(':memory:');
  db.prepare("INSERT INTO users(id,handle,password_hash,clerk_user_id) VALUES('a','alice','','user_1')").run();
  expect(()=>db.prepare("INSERT INTO users(id,handle,password_hash,clerk_user_id) VALUES('b','bob','','user_1')").run()).toThrow();
});
it('drops sponsored data from a version-3 database that has ads, stats and opted-in users',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'pingme-mig-')),'v3.db');
  const v3=openDatabaseAtVersion3(path);
  v3.exec(`INSERT INTO users(id,handle,password_hash,sponsored_opt_in,is_admin) VALUES('u1','alice','',1,1);
    INSERT INTO sponsors VALUES('s1','Acme','',1);
    INSERT INTO ads(id,sponsor_id,headline,url,starts_at,ends_at,created_at) VALUES('a1','s1','Hi','https://acme.example/',0,9999999999999,1);
    INSERT INTO ad_stats VALUES('a1','2026-10-18',3,1);`);
  v3.close();
  const db=openDatabase(path);
  expect(db.prepare('PRAGMA user_version').get()!.user_version).toBe(4);
  expect(db.prepare("SELECT handle,is_admin AS a FROM users").get()).toEqual({handle:'alice',a:1});
  expect(columns(db,'users')).not.toContain('sponsored_opt_in');
  expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('ads','sponsors','ad_stats')").get()).toEqual({n:0});
});
