import { useSyncExternalStore } from 'react';
export type ThemePref='system'|'light'|'dark';
export type Theme='light'|'dark';
const KEY='agentmoop-theme';
// Raw hex values mirror styles/tokens.css for consumers that cannot read CSS variables.
export const palette={
  light:{bg:'#F7F7F5',surface:'#FFFFFF',surface2:'#EFEFEC',ink:'#16181D',muted:'#5E6470',line:'#E4E5E1',accent:'#0F766E',onAccent:'#FFFFFF',danger:'#B42318'},
  dark:{bg:'#111315',surface:'#181B1E',surface2:'#202428',ink:'#ECEDEE',muted:'#9AA0A8',line:'#2A2E33',accent:'#5EC4B6',onAccent:'#0B1F1C',danger:'#FF8A80'},
} as const;
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(l=>l());
const darkQuery=()=>window.matchMedia('(prefers-color-scheme: dark)');
function readPref():ThemePref{
  try{const v=localStorage.getItem(KEY);return v==='light'||v==='dark'?v:'system';}catch{return 'system';}
}
let pref:ThemePref='system';
function apply(){
  if(pref==='system')delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme=pref;
}
/** Applies the stored preference to <html> before the first render, so there is no flash. */
export function initTheme(){
  pref=readPref();apply();
  darkQuery().addEventListener('change',notify);
}
export function setThemePref(next:ThemePref){
  pref=next;
  try{if(next==='system')localStorage.removeItem(KEY);else localStorage.setItem(KEY,next);}catch{/* storage unavailable: keep the choice for this session only */}
  apply();notify();
}
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
export const useThemePref=()=>useSyncExternalStore(subscribe,()=>pref);
export const useTheme=():Theme=>useSyncExternalStore(subscribe,()=>pref==='system'?(darkQuery().matches?'dark':'light'):pref);
