import { removeCounter } from './remove_counter.mjs?v=20';
// One native row keeps the large arrows, counter and reset button aligned at any zoom.
export const COUNTER_HEIGHT = 96;
export function addFolderCounter(node) {
  const rows=(node.widgets || []).filter(w=>w.name==='folder_position');
  const existing=rows.find(w=>w._magikNavigationVersion===20);
  const insertion=rows.length?node.widgets.indexOf(rows[0]):node.widgets.length;
  for(const row of rows)if(row!==existing)removeCounter(node,row);
  if(existing)return existing;
  const widget = {
    name: 'folder_position', type: 'magik_folder_position', value: '0/0', _magikNavigationVersion: 20,
    options: { serialize: false, tooltip: 'Previous video · current index / total · 1st: select first video · next video' },
    computeSize: width => [width, COUNTER_HEIGHT],
    computeLayoutSize: () => ({ minHeight: COUNTER_HEIGHT, maxHeight: COUNTER_HEIGHT, minWidth: 320 }),
    draw(ctx, owner, width, y) {
      this._top = y;
      const arrowWidth = Math.min(112, Math.max(48, (width - 184) / 2));
      const mid = y + COUNTER_HEIGHT / 2;
      const combo = owner.widgets?.find(w => w.name === 'video');
      const enabled = (combo?.options?.values?.length || 0) > 0;
      this._buttons = [{x:6,y:y+6,w:arrowWidth,h:84,action:-1},
                       {x:width-6-arrowWidth,y:y+6,w:arrowWidth,h:84,action:1}];
      const values = combo?.options?.values || [];
      const current = values.indexOf(combo?.value);
      const displayed = `${current < 0 ? 0 : current + 1}/${values.length}`;
      ctx.save();ctx.beginPath();ctx.rect(0,y,width,COUNTER_HEIGHT);ctx.clip();
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 18px monospace';
      const textWidth=Math.min(Math.max(24,width-2*arrowWidth-80),ctx.measureText?.(displayed)?.width || displayed.length*11);
      const start=(width-textWidth-8-48)/2;
      ctx.fillStyle='#ffd866';ctx.fillText(displayed,start+textWidth/2,mid,textWidth);
      this._buttons.push({x:start+textWidth+8,y:mid-19,w:48,h:38,action:'first'});
      for(const button of this._buttons) {
        ctx.fillStyle=enabled?(button.action==='first'?'#305245':'#303846'):'#262b33';
        ctx.fillRect(button.x,button.y,button.w,button.h);
        ctx.strokeStyle='#77859b';ctx.strokeRect(button.x+.5,button.y+.5,button.w-1,button.h-1);
        ctx.fillStyle=enabled?'#eee':'#777';
        ctx.font=button.action==='first'?'bold 17px sans-serif':`bold ${Math.min(72,arrowWidth-8)}px sans-serif`;
        ctx.fillText(button.action==='first'?'1st':button.action<0?'◀':'▶',button.x+button.w/2,mid,button.w-6);
      }
      ctx.restore();
    },
    mouse(event, position, owner) {
      if(!['pointerdown','mousedown'].includes(event.type)||(event.button??0)!==0)return false;
      const [x,y]=position;
      const button=this._buttons?.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
      if(!button)return false;
      if(button.action==='first')owner._magikFirstSelection?.();
      else owner._magikMoveSelection?.(button.action);
      return true;
    },
  };
  node.addCustomWidget(widget);
  const registered=node.widgets.find(w=>w.name==='folder_position') || widget;
  registered._magikNavigationVersion=20;
  const added=node.widgets.indexOf(registered);
  if(rows.length && added>=0){node.widgets.splice(added,1);node.widgets.splice(Math.min(insertion,node.widgets.length),0,registered);}
  return registered;
}
