import { pixApiUrl } from '../shared/api_url.mjs';

export function installVideoControls(node, refresh, changed) {
  const get = name => node.widgets?.find(w => w.name === name);
  let disposed=false, timer, request=0, controller;
  const root=document.createElement('div');
  root.style.cssText='position:relative;width:100%;height:100%;min-height:0;overflow:hidden';
  const inner=document.createElement('div');
  inner.style.cssText='position:absolute;inset:3px 41% 3px 8px;display:flex;flex-direction:column;justify-content:center;gap:3px;font:11px/1.2 sans-serif;color:#b9c8da;overflow:hidden';root.append(inner);
  const durationBox=document.createElement('div');
  durationBox.style.cssText='position:absolute;inset:3px 8px 3px 60%;container-type:inline-size;display:flex;align-items:center;justify-content:center;overflow:hidden';
  const duration=document.createElement('div');
  duration.style.cssText='font:700 clamp(16px,18cqw,76px)/1 sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;color:#ffd866;text-align:center';
  durationBox.append(duration);root.append(durationBox);
  const setDuration=seconds=>{
    const valid=Number.isFinite(seconds) && seconds>0;
    duration.textContent=valid ? `${seconds.toFixed(2)} s` : '—';
    // Keep long videos legible without shrinking the whole information row.
    if(valid && seconds>=60){
      const total=Math.floor(seconds),h=Math.floor(total/3600),m=Math.floor(total/60)%60,s=total%60;
      duration.textContent=h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
    }
    duration.title=valid ? `Selected video duration: ${seconds.toFixed(2)} seconds` : 'Selected video duration unavailable';
  };
  const line=()=>{const e=document.createElement('div');e.style.cssText='white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0';inner.append(e);return e;};
  const loaded=line(), next=line(), source=line(), memory=line(), notice=line();
  loaded.style.color='#a9eaa9';next.style.color='#ffd866';notice.style.color='#ffb87d';
  let lastLoaded='';
  const selection = () => {
    loaded.textContent='Loaded: '+(lastLoaded || '—');loaded.title=loaded.textContent;
    next.textContent='Next: '+(get('video')?.value || '—');next.title=next.textContent;
  };
  const info = () => {
    if(disposed)return;
    clearTimeout(timer);++request;controller?.abort();
    selection();setDuration(null);source.title='';source.textContent='Source: reading…';memory.textContent='';
    const ticket=request;
    timer=setTimeout(async()=>{
      if(disposed)return;
      const params={};
      for(const name of ['folder','video','include_subfolders','max_frames','force_fps','skip_first_frames','custom_width','custom_height']) {
        params[name]=String(get(name)?.value ?? (name==='include_subfolders'?true:''));
      }
      if(!params.video){source.textContent='Source: no video selected';return;}
      controller=new AbortController();
      try {
        const res=await fetch(pixApiUrl('/magik_video_loader/api/info?'+new URLSearchParams(params)),{signal:controller.signal});
        const data=await res.json();if(ticket!==request || disposed)return;
        if(!res.ok)throw Error(data.error || 'Could not read source info');
        const s=data.source,b=data.batch;
        setDuration(s.duration);
        source.textContent=`Source (next): ${s.width}×${s.height} · ${s.fps.toFixed(3)} FPS · ${s.duration.toFixed(2)} s`;
        memory.textContent=b.tensor_bytes == null ? "Batch RAM: unknown (source length unavailable)" : `Batch ≈ ${(b.tensor_bytes/1073741824).toFixed(2)} GiB · ${b.frame_count} frames · ${b.width}×${b.height}`;
        memory.title='Estimate for the float32 RGB output tensor only. Decode buffers, audio and downstream nodes use additional memory. Frame counts can be approximate.';
      }catch(e){if(ticket===request && !disposed && e.name!=='AbortError'){source.textContent='Source info unavailable';source.title=e.message;memory.textContent='';}}
    },250);
  };
  const widget=node.addDOMWidget('video_details','video_details',root,{serialize:false,getHeight:()=>92,getMinHeight:()=>92,getMaxHeight:()=>92});
  widget.computeSize=w=>[w,92];widget.computeLayoutSize=()=>({minHeight:92,maxHeight:92,minWidth:1});
  const placeBefore=(w,name)=>{const index=node.widgets.indexOf(w);node.widgets.splice(index,1);const target=node.widgets.findIndex(x=>x.name===name);node.widgets.splice(target<0?node.widgets.length:target,0,w);};
  placeBefore(widget,'magik_video_loader_video_source');
  const refreshButton=node.addWidget('button','↻ Refresh folder',null,async()=>{node._magikLvCurVal=null;if(await refresh() && !disposed){notice.textContent='Folder refreshed';info();changed();}},{serialize:false});
  refreshButton.computeSize=w=>[w,26];refreshButton.computeLayoutSize=()=>({minHeight:26,maxHeight:26,minWidth:1});
  placeBefore(refreshButton,'folder_position');
  node._magikMoveSelection=direction=>{
    const combo=get('video'),files=combo?.options?.values || [];
    if(!files.length)return;
    const index=files.indexOf(combo.value);
    combo.value=files[index < 0 ? (direction < 0 ? files.length - 1 : 0) : (index+direction+files.length)%files.length];
    combo.callback?.(combo.value);notice.textContent='';selection();info();changed();node.graph?.setDirtyCanvas(true,true);
  };
  node._magikFirstSelection=()=>{
    const combo=get('video'),files=combo?.options?.values || [];
    if(!files.length)return;
    combo.value=files[0];
    combo.callback?.(combo.value);notice.textContent='';notice.title='';
    selection();info();changed();node.graph?.setDirtyCanvas(true,true);
  };
  node._magikSetLoaded=payload=>{
    lastLoaded=payload.current;selection();
    const skipped=payload.skipped || [];
    notice.textContent=skipped.length?`Skipped ${skipped.length} unreadable file(s)`:(payload.behavior==='increment & hold last' && payload.current===payload.next?'End reached · holding last file':'');
    notice.title=skipped.map(s=>`${s.video}: ${s.error}`).join('\n');
    info();
  };
  node._magikRefreshInfo=info;
  const restores=[];
  for(const name of ['max_frames','force_fps','skip_first_frames','custom_width','custom_height','behavior','skip_unreadable']) {
    const w=get(name);if(!w)continue;const previous=w.callback;
    w.callback=function(){const r=previous?.apply(this,arguments);if(name==='behavior')node._magikCursorManual?.();info();return r;};
    restores.push(()=>{w.callback=previous;});
  }
  info();
  return()=>{disposed=true;clearTimeout(timer);++request;controller?.abort();restores.forEach(fn=>fn());delete node._magikMoveSelection;delete node._magikFirstSelection;delete node._magikSetLoaded;delete node._magikRefreshInfo;};
}
