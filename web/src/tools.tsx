import type { ReactNode } from 'react';
import claudeIcon from './assets/claude.svg';
import openaiIcon from './assets/openai.svg';
export type Step={text:ReactNode;copy?:string};
export type Tool={slug:string;name:string;logo:string;blurb:string;steps:Step[];check:ReactNode;notes:ReactNode[]};
const origin=window.location.origin;
export const tools:Tool[]=[
  {slug:'claude-code',name:'Claude Code',logo:claudeIcon,blurb:'Cards above your prompt. Reply in place.',
    steps:[
      {text:'Add the marketplace.',copy:`/plugin marketplace add ${origin}/claude-plugin/marketplace.json`},
      {text:'Install the plugin.',copy:'/plugin install agentmoop@agentmoop'},
      {text:<>Restart Claude Code, then run <code>/mcp</code>, choose <strong>agentmoop</strong> and sign in.</>},
      {text:<>Moop someone: <code>/moop @friend hi</code>, or type <code>@friend hi</code> at the prompt.</>},
    ],
    check:'The agentmoop line above your prompt lists your friends. Incoming moops show as cards you can reply to in place.',
    notes:[
      <>If the line says "sign in", run <code>/mcp</code> again and choose agentmoop.</>,
      "To share a screenshot, drag the file into the prompt; pasted images can't be sent.",
    ]},
  {slug:'codex',name:'Codex',logo:openaiIcon,blurb:'Send and read moops from Codex.',
    steps:[
      {text:'Add the connector.',copy:`codex mcp add agentmoop --url ${origin}/mcp`},
      {text:'Sign in.',copy:'codex mcp login agentmoop'},
      {text:'Ask Codex: "check my AgentMoop inbox", or "send a moop to @friend: hi".'},
    ],
    check:'Codex lists your recent moops.',
    notes:['Codex shows moops when you ask; there are no cards above the prompt.']},
  {slug:'claude-app',name:'Claude app and Cowork',logo:claudeIcon,blurb:'Use AgentMoop as a connector.',
    steps:[
      {text:<>Open <strong>Settings</strong>, then <strong>Connectors</strong>, then <strong>Add custom connector</strong>.</>},
      {text:'Paste this address, then Connect and sign in.',copy:`${origin}/mcp`},
      {text:'Ask Claude: "check my AgentMoop inbox", or "send a moop to @friend: hi".'},
    ],
    check:'Claude can list your recent moops.',
    notes:['Messages are read on request; only Claude Code shows cards.']},
];
