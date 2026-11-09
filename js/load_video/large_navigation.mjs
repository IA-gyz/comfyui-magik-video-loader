import { addFolderCounter } from './counter.mjs?v=large-navigation-20';

// This entry is deliberately independent of the main loader module's browser cache.
export function ensureLargeNavigation(node) {
  if (node.comfyClass !== 'MagikVideoLoader' && node.type !== 'MagikVideoLoader') return;
  // The factory reuses the current row and removes every older duplicate.
  addFolderCounter(node);
  if (!node._magikFirstSelection) {
    node._magikFirstSelection = () => {
      const combo = node.widgets?.find(w => w.name === 'video');
      const files = combo?.options?.values || [];
      if (!files.length) return;
      combo.value = files[0];
      combo.callback?.(combo.value);
      node._magikRefreshInfo?.();
      node.graph?.change?.();
      node.graph?.setDirtyCanvas(true, true);
    };
  }
  // Enlarge older saved nodes if necessary so the new row isn't squeezed out.
  const minimum = node.computeSize?.();
  if (minimum && node.size) node.setSize?.([Math.max(320, node.size[0], minimum[0]), Math.max(node.size[1], minimum[1])]);
  node.graph?.setDirtyCanvas(true, true);
}
