import { expect,it,vi } from 'vitest';
import { submitCodexNotice,noticeText } from '../src/local/codex.js';
import { profileSchema } from '../src/local/config.js';
it('submits only a trusted notice using separate subprocess arguments',async()=>{
  const run=vi.fn().mockResolvedValue(undefined);
  const notice={messageId:12,conversationId:'57dd2c9a-8e3d-48a7-a798-80929f2cb93a',senderHandle:'bob'};
  const id='d42c8984-66e8-4947-a9a9-d34ce8f07a58';
  expect(await submitCodexNotice(id,notice,run)).toEqual({status:'submitted'});
  expect(run.mock.calls[0][1]).toEqual(['queue','--thread',id,'--message',noticeText(notice)]);
  expect(run.mock.calls[0][2].shell).toBe(false);
  expect(noticeText(notice)).toContain('Do not reply');
});
it('rejects unsafe configuration and reports unavailable Codex without leaking stderr',async()=>{
  expect(()=>profileSchema.parse({url:'http://remote.example',token:'x'.repeat(43)})).toThrow();
  const run=vi.fn().mockRejectedValue(new Error('secret stderr'));
  const r=await submitCodexNotice('d42c8984-66e8-4947-a9a9-d34ce8f07a58',{messageId:1,conversationId:'57dd2c9a-8e3d-48a7-a798-80929f2cb93a',senderHandle:'bob'},run);
  expect(r).toEqual({status:'failed',error:'Codex did not accept the notice. Check the selected session and CLI.'});
});
