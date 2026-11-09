import assert from 'node:assert/strict';
import {installFolderLoop} from '../js/load_video/loop.mjs';
class API extends EventTarget { emit(detail) {const e=new Event('magik_video_loader_cursor'); e.detail=detail;this.dispatchEvent(e);} }
const api=new API();let changes=0, callbacks=0;
const combo={name:'video',value:'a.mp4',options:{values:['a.mp4','b.mp4']},callback(){callbacks++;node._magikCursorManual();}};
const node={properties:{},graph:{setDirtyCanvas(){}},widgets:[combo,
 {name:'loop_through_folder',value:true},{name:'include_subfolders',value:false},
 {name:'folder',value:'/clips'},{name:'loop_identity',value:''},{name:'loop_reset',value:''}]};
const off=installFolderLoop(api,node,null,()=>changes++);
const payload={identity:node.properties.magikVideoIdentity,reset:node.properties.magikVideoReset,
 folder:'/clips',include_subfolders:false,loop:true,files:['a.mp4','b.mp4'],current:'a.mp4',next:'b.mp4',token:'one'};
api.emit(payload);assert.equal(combo.value,'b.mp4');assert.equal(node.properties.magikVideoReset,payload.reset);
node.onExecuted({magik_video_cursor:[payload]});assert.equal(changes,1);
api.emit({...payload,identity:'another-node',token:'two'});assert.equal(changes,1);
combo.value='a.mp4';node._magikCursorManual();api.emit({...payload,token:'stale'});assert.equal(combo.value,'a.mp4');
// A missed first event is harmless: the second payload contains the backend's next file.
api.emit({...payload,reset:node.properties.magikVideoReset,current:'b.mp4',next:'a.mp4',token:'three'});assert.equal(combo.value,'a.mp4');
const clone={properties:{...node.properties},widgets:[],graph:{}};
const offClone=installFolderLoop(api,clone,null,()=>{});assert.notEqual(clone.properties.magikVideoIdentity,node.properties.magikVideoIdentity);
offClone();off();api.emit({...payload,token:'removed'});assert.equal(callbacks,2);
console.log('Passed cursor mirroring, duplicate delivery, UUID isolation, clone identity, stale-result guards, manual resets, missed-event recovery, and cleanup.');

const replayOff=installFolderLoop(api,node,null,()=>{});
const replay={...payload,identity:node.properties.magikVideoIdentity,reset:node.properties.magikVideoReset};
api.emit({...replay,token:'older',next:'a.mp4'});
api.emit({...replay,token:'newer',next:'b.mp4'});
node.onExecuted({magik_video_cursor:[{...replay,token:'older',next:'a.mp4'}]});
assert.equal(combo.value,'b.mp4');replayOff();
console.log('Passed delayed duplicate-result replay after a newer selection.');
