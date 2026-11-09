import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../js/load_video/folder_browser.mjs',import.meta.url),'utf8'))
 .replace("import { pixApiUrl } from '../shared/api_url.mjs';",'const pixApiUrl = path => path;');
const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const history=await import(url);
const values=new Map();const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
assert.deepEqual(history.loadRecentFolders(storage),[]);
for(let i=1;i<=7;i++)history.rememberRecentFolder('/clips/'+i,storage);
assert.deepEqual(history.loadRecentFolders(storage),['/clips/7','/clips/6','/clips/5','/clips/4','/clips/3']);
history.rememberRecentFolder('/clips/5',storage);
assert.deepEqual(history.loadRecentFolders(storage),['/clips/5','/clips/7','/clips/6','/clips/4','/clips/3']);
history.rememberRecentFolder('',storage);assert.equal(history.loadRecentFolders(storage).length,5);
const reloaded=await import(url+'#reload');assert.deepEqual(reloaded.loadRecentFolders(storage),history.loadRecentFolders(storage));
const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
assert.doesNotThrow(()=>history.rememberRecentFolder('/offline',blocked));
assert.equal(history.loadRecentFolders(blocked)[0],'/offline');
assert.doesNotThrow(()=>history.loadRecentFolders({getItem:()=>'{broken'}));
console.log('Passed five-folder cap, newest-first order, duplicates, empty selection, persistence, blocked storage, and malformed storage.');

assert.deepEqual(history.loadPinnedFolders(storage),[]);
history.togglePinnedFolder('/favorite',storage);
history.togglePinnedFolder('/second',storage);
assert.deepEqual(history.loadPinnedFolders(storage),['/favorite','/second']);
assert.deepEqual(reloaded.loadPinnedFolders(storage),['/favorite','/second']);
history.togglePinnedFolder('/favorite',storage);
assert.deepEqual(history.loadPinnedFolders(storage),['/second']);
assert.doesNotThrow(()=>history.togglePinnedFolder('/offline-pin',blocked));
console.log('Passed pin/unpin, pin persistence, unique pins, and blocked-storage fallback.');
