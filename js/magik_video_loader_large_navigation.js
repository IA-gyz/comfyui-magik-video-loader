import { app } from '../../scripts/app.js';
import { ensureLargeNavigation } from './load_video/large_navigation.mjs?v=20';

app.registerExtension({
  name: 'Magik.VideoLoader.LargeNavigation.20',
  nodeCreated(node) { ensureLargeNavigation(node); },
  loadedGraphNode(node) { ensureLargeNavigation(node); },
});
queueMicrotask(() => {
  for (const node of app.graph?._nodes || []) ensureLargeNavigation(node);
});
console.info('[Magik Video Loader] Large navigation v20 loaded (84px arrows + 1st button)');
