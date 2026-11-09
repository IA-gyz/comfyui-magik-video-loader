import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
class Element {
 constructor(tag){this.tagName=tag;this.style={};this.children=[];this.textContent='';}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 addEventListener(){}
 remove(){}
 showModal(){this.open=true;}
 close(){this.open=false;}
}
globalThis.document={createElement:tag=>new Element(tag),body:new Element('body')};
const importTest=async file=>{
 const source=(await readFile(new URL('../js/load_video/'+file,import.meta.url),'utf8')).replace("import { pixApiUrl } from '../shared/api_url.mjs';",'const pixApiUrl = p => p;');
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
};
let fetches=0;
globalThis.fetch=async()=>{fetches++;return {ok:true,json:async()=>({source:{width:640,height:360,fps:24,duration:5},batch:{tensor_bytes:120*640*360*12,frame_count:120,width:640,height:360}})};};
const {installVideoControls}=await importTest('controls.mjs');
let changes=0,refreshes=0,manual=0;
const widget=(name,value)=>({name,value,callback(){manual++;}});
const node={graph:{setDirtyCanvas(){}},widgets:[widget('video','a.mp4'),widget('folder','/clips'),widget('include_subfolders',true),widget('max_frames',0),widget('force_fps',0),widget('skip_first_frames',0),widget('custom_width',0),widget('custom_height',0),widget('behavior','increment & loop'),widget('skip_unreadable',false),widget('folder_position'),widget('magik_video_loader_video_source')],
 addDOMWidget(name,type,element,options){const w={name,type,element,options};this.widgets.push(w);return w;},
 addWidget(type,name,value,callback,options){const w={type,name,value,callback,options};this.widgets.push(w);return w;}};
const video=node.widgets.find(w=>w.name==='video');video.options={values:['a.mp4','b.mp4','c.mp4']};
const off=installVideoControls(node,async()=>{refreshes++;return true;},()=>changes++);
node._magikMoveSelection(-1);assert.equal(video.value,'c.mp4');
node._magikMoveSelection(1);assert.equal(video.value,'a.mp4');
assert.equal(manual,2);
video.value='c.mp4';node._magikFirstSelection();assert.equal(video.value,'a.mp4');assert.equal(manual,3);
video.value='removed.mp4';node._magikMoveSelection(1);assert.equal(video.value,'a.mp4');
video.value='removed.mp4';node._magikMoveSelection(-1);assert.equal(video.value,'c.mp4');
video.value='a.mp4';
node._magikSetLoaded({current:'loaded.mp4',next:'a.mp4',skipped:[{video:'bad.mp4',error:'corrupt'}]});
await new Promise(resolve=>setTimeout(resolve,300));
const details=node.widgets.find(w=>w.name==='video_details').element.children[0].children;
assert.match(details[0].textContent,/Loaded: loaded.mp4/);assert.match(details[1].textContent,/Next: a.mp4/);
assert.match(details[2].textContent,/640×360/);assert.match(details[3].textContent,/GiB/);assert.match(details[4].title,/bad.mp4: corrupt/);
assert.equal(fetches,1); // Debounced navigation/parameter updates.
const duration=node.widgets.find(w=>w.name==='video_details').element.children[1].children[0];
assert.equal(duration.textContent,'5.00 s');
assert.match(duration.title,/Selected video duration: 5.00 seconds/);
globalThis.fetch=async()=>({ok:true,json:async()=>({source:{width:640,height:360,fps:24,duration:3661},batch:{tensor_bytes:0,frame_count:0,width:640,height:360}})});
node._magikRefreshInfo();assert.equal(duration.textContent,'—');
await new Promise(resolve=>setTimeout(resolve,300));assert.equal(duration.textContent,'1:01:01');
globalThis.fetch=async()=>({ok:false,json:async()=>({error:'unreadable'})});
node._magikRefreshInfo();await new Promise(resolve=>setTimeout(resolve,300));assert.equal(duration.textContent,'—');
await node.widgets.find(w=>w.name==='↻ Refresh folder').callback();assert.equal(refreshes,1);
assert.ok(node.widgets.findIndex(w=>w.name==='video_details')<node.widgets.findIndex(w=>w.name==='magik_video_loader_video_source'));
off();await new Promise(resolve=>setTimeout(resolve,300));assert.equal(fetches,1);
console.log('Passed Previous/Next wrap, refresh, Loaded/Next readout, source/RAM info, skipped-file reporting, debouncing, ordering, and timer cleanup.');
// Exercise the actual folder dialog, including pin-button initialization and shortcuts.
const {installFolderBrowser,loadPinnedFolders}=await importTest('folder_browser.mjs');
const folder=widget('folder','/clips');const browserNode={widgets:[folder],graph:{setDirtyCanvas(){}},addWidget:node.addWidget};
globalThis.fetch=async()=>({ok:true,json:async()=>({path:'/clips',parent:'/',folders:['sub'],videos:['a.mp4']})});
const offBrowser=installFolderBrowser(browserNode);browserNode.widgets.find(w=>w.type==='button').callback();
await new Promise(resolve=>setTimeout(resolve,0));
const panel=document.body.children.at(-1);const all=e=>[e,...e.children.flatMap(all)];
assert.ok(all(panel).some(e=>e.textContent==='Pinned folders'));
assert.ok(all(panel).some(e=>e.textContent==='Recent folders'));
const pin=all(panel).find(e=>e.textContent==='☆ Pin folder');assert.ok(pin);assert.equal(pin.disabled,false);pin.onclick();assert.deepEqual(loadPinnedFolders(),['/clips']);
assert.ok(all(panel).some(e=>e.textContent==='★ /clips'));offBrowser();
console.log('Passed folder-panel opening, pinned/recent sections, folder probing, pin action, and shortcut rendering.');
