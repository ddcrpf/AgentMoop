import { Copy } from './Copy';
import type { Step } from '../tools';
export function ToolSteps({steps}:{steps:Step[]}){
  return <ol className="setup-steps">{steps.map((s,i)=><li key={i}><p>{s.text}</p>{s.copy&&<Copy text={s.copy}/>}</li>)}</ol>;
}
