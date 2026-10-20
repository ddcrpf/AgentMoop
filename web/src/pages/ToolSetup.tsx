import { Link, Navigate, useParams } from 'react-router';
import { ToolLogo } from '../components/ToolTiles';
import { ToolSteps } from '../components/ToolSteps';
import { tools } from '../tools';
export function ToolSetup(){
  const {tool:slug}=useParams();const tool=tools.find(t=>t.slug===slug);
  if(!tool)return <Navigate to="/setup" replace/>;
  return <main className="page guide">
    <Link to="/app" className="back">Back to Home</Link>
    <section className="panel">
      <div className="guide-head"><ToolLogo src={tool.logo}/><h1>Set up {tool.name}</h1></div>
      <ToolSteps steps={tool.steps}/>
      <div className="guide-foot">
        <p><strong>Check it worked:</strong> {tool.check}</p>
        {tool.notes.map((n,i)=><p key={i} className="muted">{n}</p>)}
        <p><Link to={`/docs/${tool.slug}`} className="quiet-link">Full guide</Link></p>
      </div>
    </section>
  </main>;
}
