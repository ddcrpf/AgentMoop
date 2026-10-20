import { Link } from 'react-router';
import { tools } from '../tools';
export function ToolLogo({src}:{src:string}){
  return <img className="tool-logo" src={src} alt=""/>;
}
export function ToolTiles({base='/setup'}:{base?:string}){
  return <ul className="tool-tiles">{tools.map(t=><li key={t.slug}>
    <Link className="tool-tile" to={`${base}/${t.slug}`}><ToolLogo src={t.logo}/><strong>{t.name}</strong><span>{t.blurb}</span></Link>
  </li>)}</ul>;
}
