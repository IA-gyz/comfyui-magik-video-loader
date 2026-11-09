import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../js/load_video/folder_browser.mjs',import.meta.url),'utf8'))
 .replace("import { pixApiUrl } from '../shared/api_url.mjs';",'const pixApiUrl = path => path;');
const {installFolderBrowser}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const folder={name:'folder',value:'/home/test/videos'};
const video={name:'video',value:'clip.mp4'};
const node={widgets:[folder,video],addWidget(type,name,value,callback,options){
 const widget={type,name,value,callback,options};this.widgets.push(widget);return widget;
},addDOMWidget(){throw new Error('Browse row must use native layout');}};
const dispose=installFolderBrowser(node);
assert.equal(node.widgets[1].type,'button');
assert.equal(node.widgets[2],video);
assert.equal(node.widgets[1].options.serialize,false);
assert.equal(folder.value,'/home/test/videos');
assert.deepEqual(node.widgets[1].computeSize(400),[400,28]);
assert.match(node.widgets[1].label,/videos/);
folder.value='';node._magikFolderBrowserSync();assert.match(node.widgets[1].label,/All input videos/);
dispose();assert.equal(node._magikFolderBrowserSync,undefined);
console.log('Passed native Browse row, ordering, fixed height, label refresh, saved path preservation, and cleanup.');
