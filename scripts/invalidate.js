import { MODULE_ID, CATEGORY_KEYS } from './constants.js';
import { scaleFor } from './scaling.js';
import { log } from './logger.js';

/**
 * Derived-data invalidation.
 *
 * Ranges, movement, and token vision are all computed during data preparation
 * and then cached. Nothing re-runs that on its own when the active scene
 * changes, so without this a scene change leaves every value at the previous
 * scene's scaling.
 */

let lastScaleKey = null;

function currentScaleKey() {
  const scene = canvas?.scene;
  return CATEGORY_KEYS.map(k => scaleFor(scene, k)).join('|');
}

export function registerInvalidation() {
  const ifChanged = () => {
    const key = currentScaleKey();
    if (key === lastScaleKey) return;
    lastScaleKey = key;
    invalidate();
  };

  Hooks.on('canvasReady', ifChanged);

  // Editing the scene's profile, override, or grid changes the scale without
  // any canvas change, so watch those too.
  Hooks.on('updateScene', (scene, changed) => {
    if (scene.id !== canvas?.scene?.id) return;
    const touched = foundry.utils.hasProperty(changed, `flags.${MODULE_ID}`)
      || foundry.utils.hasProperty(changed, 'grid');
    if (touched) ifChanged();
  });
}

/** Force a re-derive now, regardless of whether the scale looks unchanged. */
export function invalidate() {
  lastScaleKey = null;

  try {
    // reset(), not prepareData(). dnd5e's preparation overwrites derived values
    // in place and assumes the data model was re-initialized from source first;
    // a bare prepareData() skips that, so scaled values get scaled again on
    // every pass. reset() restores from source and then prepares.
    for (const actor of game.actors) safeReset(actor);

    // Unlinked tokens carry their own synthetic actors, which are not in
    // game.actors and would otherwise keep stale values.
    for (const token of canvas?.tokens?.placeables ?? []) {
      if (!token.document.actorLink) safeReset(token.actor);
      safeReset(token.document);
    }

    rerenderOpenSheets();

    // Token sight and light are scaled during document preparation, so the
    // canvas has to be told to rebuild vision from the new values.
    // `initializeVision` propagates to initializeVisionModes and refreshVision;
    // `initializeLighting` propagates to the light sources.
    updatePerception({ initializeVision: true, initializeLighting: true });

    log.debug('re-derived actors and tokens after scale change');
  } catch (err) {
    log.error('invalidation failed', err);
  }
}

/**
 * Ask the canvas to rebuild perception, passing only flags this Foundry version
 * actually defines.
 *
 * PerceptionManager throws on an unknown flag rather than ignoring it, and the
 * flag set has changed between versions — so an unfiltered call turns a cosmetic
 * refresh into an exception that aborts the whole invalidation. Filtering keeps
 * a renamed flag from breaking scaling entirely.
 */
function updatePerception(flags) {
  const manager = canvas?.perception;
  if (!manager) return;

  const supported = manager.constructor?.RENDER_FLAGS ?? {};
  const filtered = {};
  for (const [flag, value] of Object.entries(flags)) {
    if (flag in supported) filtered[flag] = value;
    else log.debug(`perception flag "${flag}" not supported in this version; skipped`);
  }

  if (Object.keys(filtered).length) manager.update(filtered);
}

/** One bad document must not abort the whole re-derive. */
function safeReset(doc) {
  if (!doc) return;
  try {
    doc.reset();
  } catch (err) {
    log.warn(`reset failed for ${doc.documentName ?? 'document'} ${doc.id ?? ''}`, err);
  }
}

function rerenderOpenSheets() {
  const isRelevant = doc => doc?.documentName === 'Actor' || doc?.documentName === 'Item';

  // ApplicationV1 sheets.
  for (const app of Object.values(ui.windows ?? {})) {
    if (isRelevant(app.document)) app.render(false);
  }
  // ApplicationV2 sheets.
  for (const app of foundry.applications.instances?.values() ?? []) {
    if (isRelevant(app.document)) app.render(false);
  }
}
