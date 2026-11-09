// Backend owns progression, as in Superbatcheur. UI events only mirror its cursor.
const owners = new Map();
const newId = () => globalThis.crypto?.randomUUID?.() || `mvl-${Date.now()}-${Math.random()}`;
export function installFolderLoop(api, node, refresh, changed) {
  const widget = name => node.widgets?.find(w => w.name === name);
  let identity;
  const seenTokens = new Set();
  let disposed = false;
  const configure = () => {
    node.properties ||= {};
    let value = node.properties.magikVideoIdentity || newId();
    if (owners.has(value) && owners.get(value) !== node) value = newId();
    if (identity && identity !== value && owners.get(identity) === node) owners.delete(identity);
    if (identity !== value) seenTokens.clear();
    identity = node.properties.magikVideoIdentity = value;
    owners.set(identity, node);
    node.properties.magikVideoReset ||= newId();
    if (widget("loop_identity")) widget("loop_identity").value = identity;
    if (widget("loop_reset")) widget("loop_reset").value = node.properties.magikVideoReset;
  };
  configure();
  for (const name of ["loop_identity", "loop_reset"]) {
    const w = widget(name);
    if (!w) continue;
    w.hidden = true;
    w.computeSize = () => [0, -4];
    w.serializeValue = () => name === "loop_identity" ? node.properties.magikVideoIdentity : node.properties.magikVideoReset;
  }
  const manual = () => {
    if (node._magikCursorApplying) return;
    node.properties.magikVideoReset = newId();
    if (widget("loop_reset")) widget("loop_reset").value = node.properties.magikVideoReset;
  };
  node._magikCursorManual = manual;
  node._magikCursorConfigure = configure;
  const apply = payload => {
    if (disposed || !payload || payload.identity !== identity || seenTokens.has(payload.token)) return;
    if (payload.reset !== node.properties.magikVideoReset ||
        payload.folder !== String(widget("folder")?.value || "") ||
        payload.include_subfolders !== (widget("include_subfolders")?.value !== false)) return;
    if (payload.sort_order && payload.sort_order !== (widget("sort_order")?.value || "alphabetical")) return;
    if (payload.behavior && payload.behavior !== (widget("behavior")?.value || "increment & loop")) return;
    if (!Array.isArray(payload.files) || typeof payload.next !== "string") return;
    seenTokens.add(payload.token);
    if (seenTokens.size > 256) seenTokens.delete(seenTokens.values().next().value);
    const combo = widget("video");
    if (!combo) return;
    node._magikCursorApplying = true;
    try {
      combo.options.values = payload.files;
      combo.value = payload.next;
      combo.callback?.(combo.value);
      node._magikSetLoaded?.(payload);
      node._magikLoopStatus?.(`Loaded ${payload.current}; next: ${payload.next}`);
      node.graph?.setDirtyCanvas(true, true);
      changed();
    } finally { node._magikCursorApplying = false; }
  };
  const event = ({detail}) => apply(detail);
  api.addEventListener("magik_video_loader_cursor", event);
  const previousExecuted = node.onExecuted;
  const onExecuted = function (output) {
    const result = previousExecuted?.apply(this, arguments);
    apply(output?.magik_video_cursor?.[0]);
    return result;
  };
  node.onExecuted = onExecuted;
  return () => {
    disposed = true;
    seenTokens.clear();
    api.removeEventListener("magik_video_loader_cursor", event);
    if (owners.get(identity) === node) owners.delete(identity);
    if (node.onExecuted === onExecuted) node.onExecuted = previousExecuted;
    delete node._magikCursorManual;
    delete node._magikCursorConfigure;
  };
}
