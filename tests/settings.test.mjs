import assert from 'node:assert/strict';
import {repairSettings,captureSettings,installModeSerialization,normalizeMode,restoreLegacySettings} from '../js/load_video/settings.mjs';
const node={widgets:[{name:'behavior',value:false},{name:'sort_order',value:'bad-old-value'},
 {name:'skip_unreadable',value:'false'},{name:'include_subfolders',value:undefined},
 {name:'video',value:'clip.mp4'},{name:'folder',value:'/clips'},{name:'custom_height',value:512}]};
repairSettings(node);
assert.equal(node.widgets[0].value,'increment & loop');assert.equal(node.widgets[1].value,'alphabetical');
assert.equal(node.widgets[2].value,false);assert.equal(node.widgets[3].value,true);
installModeSerialization(node);node.widgets[0].value=null;assert.equal(node.widgets[0].serializeValue(),'increment & loop');
node.widgets[0].value='hold_last';assert.equal(node.widgets[0].serializeValue(),'increment & hold last');
assert.equal(normalizeMode('sort_order',{value:' Natural '}),'natural');
const saved={...captureSettings(node),behavior:'increment & loop',sort_order:'natural',skip_unreadable:true};
// Names remain authoritative after unrelated layout widgets are inserted and positions change.
node.widgets.reverse();node.widgets.unshift({name:'folder_position',value:'1/24'});
repairSettings(node,saved);
const get=name=>node.widgets.find(w=>w.name===name).value;
assert.equal(get('behavior'),'increment & loop');assert.equal(get('sort_order'),'natural');
assert.equal(get('skip_unreadable'),true);assert.equal(get('folder'),'/clips');assert.equal(get('custom_height'),512);
assert.equal(get('folder_position'),'1/24');
console.log('Passed legacy invalid modes, safe defaults, API serialization, named-setting restore after widget reordering, valid-choice preservation, and unrelated-widget preservation.');

assert.equal(normalizeMode('behavior','disable loop'),'increment & loop');
assert.equal(normalizeMode('behavior','wrap'),'increment & loop');
restoreLegacySettings(node,['/old','old.mp4',100,24,2,640,360,false,true,'identity','reset','increment & hold last','natural',true]);
repairSettings(node);
assert.equal(get('folder'),'/old');assert.equal(get('behavior'),'increment & hold last');assert.equal(get('sort_order'),'natural');
console.log('Passed old positional layout migration after removing the toggle.');

repairSettings(node,{end_behavior:'hold last',folder:'/old-key'});
assert.equal(get('behavior'),'increment & hold last');
repairSettings(node,{behavior:'fixed',end_behavior:'loop'});
assert.equal(get('behavior'),'fixed');
console.log('Passed end_behavior-to-behavior named-key migration and fixed-choice preservation.');
