import type { DatabaseSync } from 'node:sqlite';
import { AppError } from '../http/errors.js';
export function rateLimit(db: DatabaseSync, key: string, max: number, windowMs = 60000) {
  const now = Date.now();
  db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(now);
  db.prepare('INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+windowMs);
  const row = db.prepare('SELECT count FROM rate_limits WHERE key=?').get(key)!;
  if (Number(row.count) > max) throw new AppError('RATE_LIMITED',429);
}
