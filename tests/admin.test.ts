import { expect, it } from 'vitest';
import { openDatabase } from '../src/db/open.js';
import { linkClerk } from '../src/cli/link.js';
it('links an existing handle to a Clerk id exactly once',()=>{
  const db=openDatabase(':memory:');
  db.prepare("INSERT INTO users(id,handle,password_hash) VALUES('u1','ddcrpf','old'),('u2','logan404','old')").run();
  linkClerk(db,'ddcrpf','user_A');
  expect(db.prepare("SELECT clerk_user_id FROM users WHERE id='u1'").get()!.clerk_user_id).toBe('user_A');
  expect(()=>linkClerk(db,'ddcrpf','user_B')).toThrow('ALREADY_LINKED');
  expect(()=>linkClerk(db,'logan404','user_A')).toThrow('CLERK_ID_IN_USE');
  expect(()=>linkClerk(db,'ghost','user_C')).toThrow('NOT_FOUND');
});
