// ╔═══════════════════════════════════════════════════════════════╗
// ║  Renderer-change signal (Nodes 2.0 <-> Legacy, live)          ║
// ╚═══════════════════════════════════════════════════════════════╝
//
// Calls back when the user flips ComfyUI's "Modern Node Design (Nodes 2.0)"
// setting WITHOUT reloading the page.
//
// WHY THIS EXISTS (user report, 2026-08-04). A node that chooses its UI once,
// at construction, is left holding the WRONG one when the renderer changes
// under it. Switch Magik showed both halves of that:
//   * legacy -> 2.0 : body went completely EMPTY (its DOM rows are built in
//                     onNodeCreated, which had already run).
//   * 2.0 -> legacy : body DOUBLED - the canvas rows painted straight over the
//                     leftover DOM row widgets, so "input 1 / input 2" showed
//                     through under the real rows.
// Both cleared on F5, which is why it looked machine-specific and got blamed on
// a newer ComfyUI. It is not: it reproduces on 1.45.21.
//
// It counts as OUR bug, not user error: core's own nodes re-render correctly on
// the flip (Load Diffusion Model swaps its Vue widgets for legacy ones in
// place), and the setting carries NO requiresReload flag, so ComfyUI never
// tells anyone to refresh.
//
// WHY A POLL RATHER THAN AN onChange. The setting belongs to CORE
// (`Comfy.VueNodes.Enabled`), so we cannot hang an onChange off it without
// registering a competing definition of somebody else's setting, and reaching
// into the Vue settings store is exactly the kind of internals grab that a
// frontend update breaks ([[reference_frontend_update_rebreaks]]).
// `LiteGraph.vueNodesMode` is a plain global boolean that BOTH renderers
// already read every frame - watching it is version-proof, costs one property
// read per tick, and cannot go stale. ONE timer serves every consumer and only
// runs while at least one callback is registered.

const listeners = new Set();
let timer = null;
let last = null;

const INTERVAL_MS = 300; // a setting flip is rare; this is only a boolean read

function currentMode() {
  return !!window.LiteGraph?.vueNodesMode;
}

function tick() {
  const now = currentMode();
  if (now === last) return;
  last = now;
  // Iterate a COPY: a handler may unregister itself (or delete its node) while
  // we are notifying, and one throwing handler must not stop the others - a
  // half-notified graph is exactly the mixed-renderer state we are fixing.
  for (const cb of [...listeners]) {
    try {
      cb(now);
    } catch (err) {
      console.warn("[Magik] renderer-change handler failed", err);
    }
  }
}

/**
 * Ask Nodes 2.0 to re-read ONE node's slots and widgets. Needed after changing
 * fields INSIDE existing slots (the `widget` marker that puts a dot on its row,
 * a label) or a widget's own sizing hook, on a node Nodes 2.0 has ALREADY
 * mounted - which is exactly what a live renderer switch leaves us with.
 *
 * Nodes 2.0 wraps the node's arrays in shallowReactive proxies, so a field
 * written inside a slot is invisible to it - and so is re-assigning the same
 * slots (`node.inputs = node.inputs.slice()`): the setter splices identical
 * items back in at identical indices, which Vue treats as no change. MEASURED
 * 2026-09-26: after a switch the markers were right within 250 ms, yet the
 * dots stayed in the top column, and a manual re-assign changed nothing.
 *
 * This fires the SAME event core's own widget rename uses (widgetUtil.ts:
 * `graph.trigger('node:slot-label:changed', { nodeId })`), whose handler in
 * useGraphNodeManager.ts re-extracts that node's Vue data. A no-op in Classic,
 * and on a frontend without the event (LGraph.trigger ignores unknown actions).
 */
export function refreshVueNodeSlots(node) {
  if (!currentMode() || !node) return;
  try {
    node.graph?.trigger?.("node:slot-label:changed", { nodeId: node.id });
  } catch (err) {
    console.warn("[Magik] could not refresh a node for Nodes 2.0", err);
  }
}

/**
 * Register a callback fired with `true` (Nodes 2.0) or `false` (legacy) each
 * time the renderer changes. NOT called on registration - only on a change.
 * Returns an unsubscribe function; call it from the node's onRemoved.
 */
export function onRendererChange(cb) {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  if (timer == null) {
    // Seed from the CURRENT mode so registering never fires a spurious change.
    last = currentMode();
    timer = setInterval(tick, INTERVAL_MS);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer != null) {
      clearInterval(timer);
      timer = null;
      last = null; // re-seeded on the next registration
    }
  };
}
