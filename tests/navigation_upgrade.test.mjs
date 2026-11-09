import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {addFolderCounter} from '../js/load_video/counter.mjs';
globalThis.__counterFactory=addFolderCounter;
const source=(await readFile(new URL('../js/load_video/large_navigation.mjs',import.meta.url),'utf8'))
 .replace("import { addFolderCounter } from './counter.mjs?v=large-navigation-20';",'const addFolderCounter=globalThis.__counterFactory;');
const {ensureLargeNavigation}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let changed=0,removed=0;
const combo={name:'video',value:'b.mp4',options:{values:['a.mp4','b.mp4']},callback(){changed++;}};
const node={type:'MagikVideoLoader',widgets:[combo,{name:'folder_position',value:'1/2'},{name:'video_details'}],
 size:[320,500],graph:{setDirtyCanvas(){},change(){}},computeSize(){return [320,700];},setSize(size){this.size=size;},
 removeWidget(index){removed++;this.widgets.splice(index,1);},addCustomWidget(w){this.widgets.push(w);}};
ensureLargeNavigation(node);assert.equal(removed,1);assert.equal(node.widgets[1]._magikNavigationVersion,20);
assert.equal(node.widgets[1].computeSize(320)[1],96);assert.equal(node.size[1],700);
node._magikFirstSelection();assert.equal(combo.value,'a.mp4');assert.equal(changed,1);
ensureLargeNavigation(node);assert.equal(removed,1);assert.equal(node.widgets.filter(w=>w.name==='folder_position').length,1);
ensureLargeNavigation({type:'OtherNode',widgets:[]});
console.log('Passed upgrade from an older cached UI, native-row replacement, larger saved-node size, 1st fallback, and duplicate-upgrade protection.');

// Reproduce the screenshot: two current-version rows already exist.
node.widgets.push({...node.widgets[1]});
ensureLargeNavigation(node);
assert.equal(node.widgets.filter(w=>w.name==='folder_position').length,1);
// A frontend removeWidget that expects a widget object silently ignores an index.
const objectAPI={...node,widgets:[combo,{name:'folder_position'},{name:'folder_position'}],removeWidget(widget){const index=this.widgets.indexOf(widget);if(index>=0)this.widgets.splice(index,1);}};
ensureLargeNavigation(objectAPI);
assert.equal(objectAPI.widgets.filter(w=>w.name==='folder_position').length,1);
assert.equal(objectAPI.widgets[0],combo);
ensureLargeNavigation(objectAPI);assert.equal(objectAPI.widgets.filter(w=>w.name==='folder_position').length,1);
// Repeated creation/configuration hooks must not append another row.
addFolderCounter(objectAPI);addFolderCounter(objectAPI);
assert.equal(objectAPI.widgets.filter(w=>w.name==='folder_position').length,1);
console.log('Passed existing duplicate rows, both removal API shapes, and repeated creation/configuration hooks.');
