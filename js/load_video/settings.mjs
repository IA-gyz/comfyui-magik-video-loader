// Persist settings by input name so UI-only rows cannot shift saved values.
const modes={behavior:{values:['fixed','increment & loop','increment & hold last'],fallback:'increment & loop'},
 sort_order:{values:['alphabetical','natural'],fallback:'alphabetical'}};
const defaults={folder:'',video:'',max_frames:0,force_fps:0,skip_first_frames:0,
 custom_width:0,custom_height:0,include_subfolders:true,
 behavior:'increment & loop',sort_order:'alphabetical',skip_unreadable:false};
export function normalizeMode(name,value) {
 const spec=modes[name];if(!spec)return value;
 if(Array.isArray(value)&&value.length===1)value=value[0];
 if(value && typeof value==='object')value=value.value;
 let text=typeof value==='string'?value.trim().toLowerCase().replace(/_/g,' '):'';
 if(name==='behavior')text=({'wrap':'increment & loop','loop':'increment & loop','disable loop':'increment & loop','hold last':'increment & hold last'})[text] || text;
 return spec.values.includes(text)?text:spec.fallback;
}
export function repairSettings(node, saved) {
 for(const [name,fallback] of Object.entries(defaults)) {
  const w=node.widgets?.find(w=>w.name===name);if(!w)continue;
  let value=saved && Object.hasOwn(saved,name)?saved[name]:w.value;
  if(name==='behavior' && saved && !Object.hasOwn(saved,'behavior') && Object.hasOwn(saved,'end_behavior'))value=saved.end_behavior;
  if(modes[name])value=normalizeMode(name,value);
  else if(typeof fallback==='boolean')value=typeof value==='boolean'?value:fallback;
  else if(typeof fallback==='number') {
   const limit=name.startsWith('custom_')?8192:name==='force_fps'?240:100000;
   value=typeof value==='number' && Number.isFinite(value)?Math.max(0,Math.min(limit,value)):fallback;
   if(name!=='force_fps')value=Math.round(value);
  } else value=typeof value==='string'?value:fallback;
  w.value=value;
 }
}
export function captureSettings(node) {
 repairSettings(node);
 return Object.fromEntries(Object.keys(defaults).map(name=>[name,node.widgets?.find(w=>w.name===name)?.value ?? defaults[name]]));
}
export function installModeSerialization(node) {
 for(const name of Object.keys(modes)) {
  const w=node.widgets?.find(w=>w.name===name);if(!w)continue;
  w.serializeValue=()=>{w.value=normalizeMode(name,w.value);return w.value;};
 }
}

export function restoreLegacySettings(node, values) {
 // Old arrays contain the removed boolean between custom_height and include_subfolders.
 if(!Array.isArray(values) || typeof values[7]!=='boolean' || typeof values[8]!=='boolean')return;
 const oldNames=['folder','video','max_frames','force_fps','skip_first_frames','custom_width','custom_height',null,'include_subfolders','loop_identity','loop_reset','behavior','sort_order','skip_unreadable'];
 oldNames.forEach((name,index)=>{const w=node.widgets?.find(w=>w.name===name);if(w && values[index]!==undefined)w.value=values[index];});
}
