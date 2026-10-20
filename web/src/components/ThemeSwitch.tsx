import { setThemePref, useThemePref, type ThemePref } from '../theme';
const options:{value:ThemePref;label:string}[]=[{value:'system',label:'System'},{value:'light',label:'Light'},{value:'dark',label:'Dark'}];
/** Native radio group: arrow keys move between options, Tab enters and leaves the group. */
export function ThemeSwitch(){
  const pref=useThemePref();
  return <fieldset className="segmented">
    <legend className="sr-only">Theme</legend>
    {options.map(o=><label key={o.value}>
      <input type="radio" name="theme" value={o.value} checked={pref===o.value} onChange={()=>setThemePref(o.value)}/>
      <span>{o.label}</span>
    </label>)}
  </fieldset>;
}
