import assert from 'node:assert/strict';
import {addFolderCounter,COUNTER_HEIGHT} from '../js/load_video/counter.mjs';
const clicks=[];const node={widgets:[{name:'video',options:{values:['a.mp4','b.mp4']}}],size:[320,700],
 addCustomWidget(w){this.widgets.push(w);},_magikMoveSelection:d=>clicks.push(d),_magikFirstSelection:()=>clicks.push('first')};
const w=addFolderCounter(node);w.value='1/24';assert.deepEqual(w.computeSize(320),[320,96]);assert.equal(w.options.serialize,false);
for(const width of [320,500,1000]) {
 const rects=[],texts=[];const ctx={save(){},restore(){},beginPath(){},clip(){},rect(...r){rects.push(r);},fillRect(...r){rects.push(r);},strokeRect(...r){rects.push(r);},fillText(...args){texts.push(args);}};
 w.draw(ctx,node,width,100);
 for(const [x,y,rw,h]of rects){assert.ok(y>=100&&y+h<=100+COUNTER_HEIGHT);assert.ok(x>=0&&x+rw<=width);}
 assert.equal(texts[0][2],148);assert.ok(w._buttons[0].w>=68);assert.equal(w._buttons[0].h,84);
 for(const button of w._buttons)assert.equal(w.mouse({type:'pointerdown',button:0},[button.x+button.w/2,button.y+button.h/2],node),true);
 assert.equal(w.mouse({type:'pointerdown',button:0},[10,99],node),false);
}
assert.deepEqual(clicks,[-1,1,'first',-1,1,'first',-1,1,'first']);
console.log('Passed large-arrow dimensions, unclipped row, centered count, 1st button and navigation hit testing at multiple widths.');
