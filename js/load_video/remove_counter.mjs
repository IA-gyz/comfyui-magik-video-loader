// Native removeWidget APIs differ across frontend builds. Verify removal before replacing UI rows.
export function removeCounter(node, widget) {
  const index=node.widgets?.indexOf(widget) ?? -1;
  if(index<0)return;
  if(typeof node.removeWidget==='function') {
    try { node.removeWidget(index); } catch {}
  }
  const remaining=node.widgets?.indexOf(widget) ?? -1;
  if(remaining>=0) {
    widget.onRemove?.();
    widget.element?.remove();
    node.widgets.splice(remaining,1);
  }
}
