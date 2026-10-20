import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { diskUsedFraction, usedFraction } from '../src/http/health.js';
it('diskUsedFraction reads a real directory as a fraction',()=>{
  const f=diskUsedFraction(tmpdir());
  expect(f).toBeGreaterThanOrEqual(0);
  expect(f).toBeLessThanOrEqual(1);
});
it('usedFraction throws when statfs reports zero blocks',()=>{
  expect(usedFraction({blocks:100,bavail:25})).toBe(0.75);
  expect(()=>usedFraction({blocks:0,bavail:0})).toThrow();
});
