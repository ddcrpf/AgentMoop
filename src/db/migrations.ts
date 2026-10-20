import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './open.js';
const hasColumn=(db:DatabaseSync,table:string,col:string)=>db.prepare(`PRAGMA table_info(${table})`).all().some(r=>r.name===col);
// Each step runs once, in order, inside its own transaction.
const steps:((db:DatabaseSync)=>void)[]=[
  db=>{
    db.exec('ALTER TABLE users ADD COLUMN clerk_user_id TEXT; CREATE UNIQUE INDEX users_clerk ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL;');
    const floor=hasColumn(db,'contacts','invite_floor')?'invite_floor':'0';
    db.exec(`CREATE TABLE contacts_v1(a TEXT REFERENCES users(id), b TEXT REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('pending','ignored','accepted','revoked')), requested_by TEXT REFERENCES users(id), invite_floor INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(a,b), CHECK(a<b));
      INSERT INTO contacts_v1(a,b,state,invite_floor) SELECT a,b,state,${floor} FROM contacts;
      DROP TABLE contacts; ALTER TABLE contacts_v1 RENAME TO contacts;
      CREATE TABLE conversation_reads(user_id TEXT NOT NULL REFERENCES users(id), conversation_id TEXT NOT NULL REFERENCES conversations(id), last_read_id INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,conversation_id));`);
  },
  db=>{
    db.exec(`CREATE TABLE attachments(id TEXT PRIMARY KEY, uploader_id TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, received INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL CHECK(status IN ('uploading','ready','deleted')), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      ALTER TABLE messages ADD COLUMN attachment_id TEXT REFERENCES attachments(id);
      ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text' CHECK(kind IN ('text','summary','context'));
      ALTER TABLE messages ADD COLUMN source_name TEXT;
      CREATE UNIQUE INDEX messages_attachment ON messages(attachment_id) WHERE attachment_id IS NOT NULL;`);
  },
  db=>{
    db.exec(`ALTER TABLE users ADD COLUMN sponsored_opt_in INTEGER;
      ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE sponsors(id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL);
      CREATE TABLE ads(id TEXT PRIMARY KEY, sponsor_id TEXT NOT NULL REFERENCES sponsors(id), headline TEXT NOT NULL, url TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, has_image INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE ad_stats(ad_id TEXT NOT NULL REFERENCES ads(id), day TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(ad_id,day));`);
  },
  db=>{
    db.exec(`DROP TABLE ad_stats; DROP TABLE ads; DROP TABLE sponsors;
      ALTER TABLE users DROP COLUMN sponsored_opt_in;`);
  },
];
export function migrateTo(db:DatabaseSync,target:number){
  for(let v=Number(db.prepare('PRAGMA user_version').get()!.user_version);v<target;v++){
    transaction(db,()=>{steps[v]!(db);db.exec(`PRAGMA user_version=${v+1}`);});
  }
}
export function migrate(db:DatabaseSync){migrateTo(db,steps.length);}
