import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ToolSteps } from '../components/ToolSteps';
import { ToolTiles } from '../components/ToolTiles';
import { tools } from '../tools';
export type DocSection={id:string;title:string;body:ReactNode};
export type DocPage={slug:string;title:string;lead?:ReactNode;sections:DocSection[]};
const origin=window.location.origin;
const stepsOf=(slug:string)=><ToolSteps steps={tools.find(t=>t.slug===slug)!.steps}/>;
const askingList=<ul>
  <li>"check my AgentMoop inbox"</li>
  <li>"send a moop to @friend: ..."</li>
  <li>"reply to @friend: ..."</li>
  <li>"send @friend a summary of notes.md"</li>
</ul>;
export const docPages:DocPage[]=[
  {slug:'',title:'AgentMoop docs',lead:'How to set up AgentMoop and use it every day.',sections:[
    {id:'what-it-is',title:'What it is',body:<>
      <p>AgentMoop lets you message friends from inside your AI tools.</p>
      <p>A moop is a message, file or shared context sent to a friend's AI session.</p>
      <p>Your moop tag is your @name.</p>
    </>},
    {id:'quick-start',title:'Quick start',body:<ol className="setup-steps">
      <li><p>Claim your moop tag.</p></li>
      <li><p>Add a friend by their tag. They accept.</p></li>
      <li><p>Connect your tool: <Link to="/docs/claude-code">Claude Code</Link>, <Link to="/docs/codex">Codex</Link> or the <Link to="/docs/claude-app">Claude app</Link>.</p></li>
      <li><p>Moop someone: <code>/moop @friend hi</code></p></li>
    </ol>},
    {id:'tools',title:'Tools',body:<ToolTiles base="/docs"/>},
  ]},
  {slug:'claude-code',title:'Claude Code',lead:'The full experience: moops arrive as cards above your prompt.',sections:[
    {id:'install',title:'Install',body:stepsOf('claude-code')},
    {id:'sending',title:'Sending',body:<>
      <p>Type <code>@friend your message</code> at the prompt and press Enter. If @friend is an accepted friend, it is sent straight away, without using a Claude turn. Otherwise the prompt goes to Claude as normal.</p>
      <p><code>/moop @friend message</code> sends text only. To send a file, use the <code>@friend</code> prompt form and drag the file in.</p>
      <h3>Files</h3>
      <p>Drag one file into the prompt, with <code>@friend</code> and your text.</p>
      <ul>
        <li>Allowed: PNG, JPEG, WebP, Markdown or plain text.</li>
        <li>Up to 10 MB.</li>
        <li>One file per message.</li>
      </ul>
      <p>Pasted images can't be sent. Save the screenshot and drag the file.</p>
    </>},
    {id:'receiving',title:'Receiving',body:<>
      <p>New moops appear as cards above your prompt within about 20 seconds, at most 3 at a time.</p>
      <p>Each card has <strong>Reply</strong> and <strong>Dismiss</strong>. Summaries and context also have <strong>Add to session</strong>.</p>
      <p>Add to session adds the shared context to your current Claude conversation. It happens only when you press it.</p>
    </>},
    {id:'line',title:'The agentmoop line',body:<ul>
      <li>It shows your friends.</li>
      <li>Click a friend to open your conversation with them.</li>
      <li><strong>hide</strong> collapses the line.</li>
    </ul>},
    {id:'summaries',title:'Summaries and context',body:<>
      <p>Ask Claude, for example "send @mira a summary of README.md" or "share what we decided with @kai".</p>
      <p>Claude drafts it and asks for your approval before sending.</p>
    </>},
    {id:'mini-game',title:'Mini-game',body:<>
      <p>While Claude is working, a small <strong>play</strong> button can appear on the line.</p>
      <p><code>/moop-games off</code> turns it off. <code>/moop-games on</code> turns it back on.</p>
    </>},
  ]},
  {slug:'codex',title:'Codex',lead:'Send and read moops from Codex.',sections:[
    {id:'setup',title:'Setup',body:stepsOf('codex')},
    {id:'asking',title:'Use it by asking',body:<>
      {askingList}
      <p>Codex shows moops when you ask; there are no cards above the prompt.</p>
    </>},
  ]},
  {slug:'claude-app',title:'Claude app and Cowork',lead:'Use AgentMoop as a connector.',sections:[
    {id:'setup',title:'Setup',body:stepsOf('claude-app')},
    {id:'asking',title:'Use it by asking',body:<>
      {askingList}
      <p>Messages are read when you ask.</p>
    </>},
  ]},
  {slug:'sharing',title:'Sharing files and context',sections:[
    {id:'messages',title:'Plain messages',body:<p>Up to 16,000 characters.</p>},
    {id:'files',title:'Files',body:<ul>
      <li>PNG, JPEG, WebP, Markdown or plain text, up to 10 MB.</li>
      <li>One file per message.</li>
      <li>Files are kept for 30 days, then deleted.</li>
      <li>Up to 30 uploads an hour.</li>
    </ul>},
    {id:'summaries',title:'Summaries',body:<p>An AI-written summary of a file. It is marked as a summary for your friend, so they can tell it apart from the original.</p>},
    {id:'context',title:'Context packets',body:<p>A short summary of decisions, open questions and links from your current conversation. You see it and approve it before it is sent.</p>},
    {id:'never-sent',title:'What is never sent',body:<p>Whole transcripts or repositories, and nothing you didn't ask to send.</p>},
  ]},
  {slug:'friends',title:'Friends and your moop tag',sections:[
    {id:'tags',title:'Tags',body:<p>3-32 lowercase letters, numbers or _. They can't be changed later.</p>},
    {id:'requests',title:'Requests',body:<p>Add a friend by tag. They accept or ignore. Only accepted friends can moop each other.</p>},
    {id:'removing',title:'Removing',body:<p><strong>Remove</strong> stops new messages and history access until a new request is accepted.</p>},
    {id:'web-inbox',title:'Web inbox',body:<p>Every conversation is also at agentmoop.com/inbox, with live updates.</p>},
  ]},
  {slug:'privacy',title:'Privacy and safety',sections:[
    {id:'who-can-read',title:'Who can read',body:<p>Only you and the friend in a conversation.</p>},
    {id:'messages',title:'Messages',body:<p>Delivered and stored to show your history. Never used for ads or AI training.</p>},
    {id:'files',title:'Files',body:<p>Deleted after 30 days.</p>},
    {id:'incoming',title:"Incoming moops are someone else's words",body:<>
      <p>AgentMoop tells your AI tool to treat them as information, not instructions.</p>
      <p>Your tool never replies or acts on a moop unless you ask.</p>
    </>},
    {id:'your-tools',title:'Your tools',body:<p>See and revoke connected tools at <code>/setup</code> (<strong>Manage</strong> on your home page).</p>},
    {id:'security',title:'Reporting security issues',body:<p>Email <a href="mailto:ddcrpf@gmail.com">ddcrpf@gmail.com</a>, as listed in SECURITY.md.</p>},
  ]},
  {slug:'troubleshooting',title:'Troubleshooting',sections:[
    {id:'sign-in',title:'The line says "sign in"',body:<p>Run <code>/mcp</code>, choose <strong>agentmoop</strong>, and sign in.</p>},
    {id:'no-cards',title:'No cards appear',body:<p>Check that your friend accepted, and wait about 20 seconds.</p>},
    {id:'tag-taken',title:'"That tag is taken"',body:<p>Pick another tag. The suggestions show what is free.</p>},
    {id:'file-refused',title:'A file was refused',body:<p>Check the type, the size, and that there is one file per message.</p>},
    {id:'not-connected',title:"Codex or Claude doesn't see AgentMoop",body:<p>Re-add the connector URL <code>{origin}/mcp</code> and sign in.</p>},
    {id:'from-pingme',title:'Moved from the old Pingme plugin',body:<p>Uninstall pingme, then install agentmoop with the commands on the <Link to="/docs/claude-code">Claude Code</Link> page.</p>},
  ]},
];
