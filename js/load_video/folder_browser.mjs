import { pixApiUrl } from '../shared/api_url.mjs';


const RECENT_FOLDER_KEY = 'Magik.VideoLoader.RecentFolders.v1';
const cleanRecentFolders = values => Array.isArray(values)
  ? [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))].slice(0, 5)
  : [];
let recentFallback = [];

export function loadRecentFolders(storage) {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(RECENT_FOLDER_KEY);
    if (saved != null) recentFallback = cleanRecentFolders(JSON.parse(saved));
  } catch { /* Browser storage may be disabled; keep session history. */ }
  return [...recentFallback];
}

export function rememberRecentFolder(path, storage) {
  if (typeof path !== 'string' || !path.trim()) return loadRecentFolders(storage);
  recentFallback = cleanRecentFolders([path.trim(), ...loadRecentFolders(storage)]);
  try { (storage ?? globalThis.localStorage)?.setItem(RECENT_FOLDER_KEY, JSON.stringify(recentFallback)); }
  catch { /* Selection still works with storage disabled. */ }
  return [...recentFallback];
}

const PINNED_FOLDER_KEY = 'Magik.VideoLoader.PinnedFolders.v1';
let pinnedFallback = [];
export function loadPinnedFolders(storage) {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(PINNED_FOLDER_KEY);
    if (saved != null) {
      const parsed = JSON.parse(saved);
      pinnedFallback = Array.isArray(parsed) ? [...new Set(parsed.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim()))] : [];
    }
  } catch { /* Session fallback when browser storage is unavailable. */ }
  return [...pinnedFallback];
}
export function togglePinnedFolder(path, storage) {
  const folders = loadPinnedFolders(storage);
  if (typeof path !== 'string' || !path.trim()) return folders;
  path = path.trim();
  pinnedFallback = folders.includes(path) ? folders.filter(p => p !== path) : [...folders, path];
  try { (storage ?? globalThis.localStorage)?.setItem(PINNED_FOLDER_KEY, JSON.stringify(pinnedFallback)); } catch {}
  return [...pinnedFallback];
}

export function installFolderBrowser(node) {
  const folder = node.widgets?.find(w => w.name === 'folder');
  if (!folder) return () => {};
  folder.hidden = true;
  folder.computeSize = () => [0, -4];
  let dialog;
  let browserWidget;
  const button = (text, title, parent, action) => {
    const b = document.createElement('button');
    b.textContent = text; b.title = title; b.type = 'button';
    b.style.cssText = 'box-sizing:border-box;flex:0 0 auto;min-height:0;font:12px/1.2 sans-serif;padding:5px 10px;border:1px solid #666;border-radius:5px;background:#303846;color:#fff;cursor:pointer';
    b.onclick = action; parent.append(b); return b;
  };
  const sync = () => {
    if (!browserWidget) return;
    const path = String(folder.value || 'All input videos');
    const short = path.length > 46 ? '…' + path.slice(-45) : path;
    browserWidget.label = 'Browse folder: ' + short;
    browserWidget.options.tooltip = folder.value || 'No folder restriction; use ComfyUI input/';
  };
  const choose = path => {
    rememberRecentFolder(path);
    folder.value = path;
    folder.callback?.(path);
    sync();
    node.graph?.setDirtyCanvas(true, true);
  };
  const open = () => {
    dialog?.close(); dialog?.remove();
    dialog = document.createElement('dialog');
    dialog.style.cssText = 'width:min(700px,85vw);height:min(560px,80vh);padding:18px;border:1px solid #69778c;border-radius:10px;background:#1c212a;color:#eee;box-sizing:border-box';
    const panel = dialog;
    const body = document.createElement('div');
    body.style.cssText = 'height:100%;display:flex;flex-direction:column;gap:10px'; dialog.append(body);
    const title = document.createElement('strong'); title.textContent='Choose video folder'; body.append(title);
    const pinned=document.createElement('div');
    pinned.style.cssText='display:flex;flex-direction:column;gap:3px;flex:0 0 auto;max-height:110px;overflow:auto';body.append(pinned);
    const renderPinned = () => {
      pinned.replaceChildren();
      const heading=document.createElement('span');heading.textContent='Pinned folders';heading.style.cssText='font:12px sans-serif;color:#ffd866';pinned.append(heading);
      const folders=loadPinnedFolders();
      for (const saved of folders) {
        const row=document.createElement('div');row.style.cssText='display:flex;gap:4px;flex-shrink:0';pinned.append(row);
        const shortcut=button('★ '+saved,'Open '+saved,row,()=>browse(saved));
        shortcut.style.cssText+=';flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        button('×','Unpin '+saved,row,()=>{togglePinnedFolder(saved);renderPinned();});
      }
      if(!folders.length){const empty=document.createElement('span');empty.textContent='Pin the current folder for permanent quick access.';empty.style.cssText='font:11px sans-serif;color:#8894a5';pinned.append(empty);}
      pinButton.textContent=folders.includes(current)?'★ Unpin folder':'☆ Pin folder';
    };
    const recent = document.createElement('div');
    recent.style.cssText='display:flex;flex-direction:column;gap:3px;flex:0 0 auto;max-height:155px;overflow:auto';
    const recentTitle=document.createElement('span'); recentTitle.textContent='Recent folders';
    recentTitle.style.cssText='font:12px sans-serif;color:#b8c4d5';recent.append(recentTitle);
    const recentFolders=loadRecentFolders();
    for(const saved of recentFolders) {
      const shortcut=button(saved,'Open '+saved,recent,()=>browse(saved));
      shortcut.style.cssText+=';display:block;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0';
    }
    if(!recentFolders.length) {
      const empty=document.createElement('span');empty.textContent='Selected folders will appear here.';
      empty.style.cssText='font:12px sans-serif;color:#8894a5;padding:3px 0';recent.append(empty);
    }
    body.append(recent);
    const bar = document.createElement('div'); bar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0';body.append(bar);
    const path = document.createElement('input'); path.type='text';path.title='Current folder; enter a path and press Enter';
    path.style.cssText='flex:1;min-width:0;background:#111820;color:#eee;border:1px solid #667;padding:7px';
    const status = document.createElement('div');status.style.cssText='font:12px sans-serif;color:#b8c4d5';
    const listing = document.createElement('div');listing.style.cssText='flex:1;min-height:0;overflow:auto;border:1px solid #455;padding:5px';
    let current='', parent='', request=0;
    const browse = async target => {
      const ticket=++request;
      status.textContent='Reading folder…';select.disabled=true;pinButton.disabled=true;
      try {
        const response=await fetch(pixApiUrl('/magik_video_loader/api/folders?'+new URLSearchParams({path:target || ''})));
        const data=await response.json(); if(ticket!==request || !panel.open)return;
        if(!response.ok)throw new Error(data.error || 'Could not open folder');
        current=data.path;parent=data.parent;path.value=current;listing.replaceChildren();
        for(const name of data.folders) {
          const b=button('📁 '+name,'Open folder',listing,()=>browse(current.replace(/[\\/]$/,'')+'/'+name));
          b.style.cssText+=';display:block;width:100%;text-align:left;margin:2px 0';
        }
        for(const name of data.videos) {
          const file=document.createElement('div');file.textContent='🎞 '+name;
          file.style.cssText='padding:6px 10px;color:#a8bacd;font:12px sans-serif';listing.append(file);
        }
        status.textContent=`${data.folders.length} folders · ${data.videos.length} videos directly inside this folder`;
        select.disabled=false;pinButton.disabled=false;renderPinned();
      } catch(error) {if(ticket===request) {status.textContent=error.message;select.disabled=true;}}
    };
    button('Up','Go to parent folder',bar,()=>browse(parent));bar.append(path);
    button('Input','Open ComfyUI input folder',bar,()=>browse(''));
    button('Home','Open home folder',bar,()=>browse('~'));
    path.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();browse(path.value);}};
    const pinButton=button('☆ Pin folder','Pin or unpin the current folder',bar,()=>{if(current){togglePinnedFolder(current);renderPinned();}});
    pinButton.disabled=true;
    renderPinned();
    body.append(status,listing);
    const actions=document.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:8px';body.append(actions);
    button('Clear restriction','Use the normal input-video list',actions,()=>{choose('');panel.close();});
    button('Cancel','Close without changes',actions,()=>panel.close());
    const select=button('Use this folder','Load videos from this folder',actions,()=>{choose(current);dialog.close();});select.disabled=true;
    panel.addEventListener('close',()=>{request++;panel.remove();},{once:true});
    document.body.append(dialog);dialog.showModal();browse(folder.value);
  };
  const widget = browserWidget = node.addWidget('button', 'Browse folder…', null, open, {serialize:false});
  widget.computeSize = width => [width, 28];
  widget.computeLayoutSize = () => ({minHeight:28, maxHeight:28, minWidth:1});
  // Keep the browser above video; the original serialized folder value stays intact.
  const index=node.widgets.indexOf(widget);node.widgets.splice(index,1);node.widgets.splice(node.widgets.indexOf(folder)+1,0,widget);
  node._magikFolderBrowserSync=sync;sync();
  return ()=>{dialog?.close();dialog?.remove();delete node._magikFolderBrowserSync;};
}
