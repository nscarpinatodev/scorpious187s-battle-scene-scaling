import { MODULE_ID } from '../constants.js';
import { scaleFor } from '../scaling.js';
import { scaleFields } from '../scale-util.js';
import { log } from '../logger.js';

/**
 * Attack range and melee reach scaling.
 *
 * Unlike templates, there is no hook for this. Core dnd5e does not enforce
 * range at all — `range.value` is a display label — and enforcement comes from
 * midi-qol, whose public `checkActivityRange` is a bundled copy of its internal
 * binding, so wrapping it never sees Midi's own workflow calls.
 *
 * The one place every consumer agrees on is the prepared data itself.
 * `RangeField.prepareData` computes `range.value` from its formula and builds
 * the display labels in the same pass, and dnd5e invokes it as
 * `RangeField.prepareData.call(this, ...)` — a property lookup on the class at
 * each call, which libWrapper can intercept. Wrapping it once therefore covers
 * Midi's range check, chat cards, and item sheets together.
 *
 * KNOWN LIMITATION: derived data is client-global, not per-scene. Scaling is
 * resolved against the scene you are *viewing*. Open an actor sheet while
 * looking at a scaled scene and its ranges read scaled even if that token
 * stands elsewhere. Midi's checks are unaffected — those run on the scene the
 * attack happens on — but sheet display can mislead. Fixing it properly would
 * mean per-token derived data, which dnd5e does not support.
 */

const TARGET = 'dnd5e.dataModels.shared.RangeField.prepareData';

export function registerRangeScaling() {
  if (!globalThis.libWrapper) {
    log.warn('libWrapper not found — range and reach scaling disabled (templates still work)');
    return false;
  }

  libWrapper.register(MODULE_ID, TARGET, function (wrapped, rollData, labels) {
    // Let dnd5e resolve the formula and build labels normally first; there is
    // nothing to scale until `range.value` actually exists.
    const result = wrapped(rollData, labels);

    try {
      applyScaling(this, labels);
    } catch (err) {
      // Data preparation runs constantly. A throw here would break every sheet
      // in the world, so scaling failure must degrade to unscaled values.
      log.error('range scaling failed; leaving values unscaled', err);
    }

    return result;
  }, 'WRAPPER');

  log.info('range scaling active');
  return true;
}

export function unregisterRangeScaling() {
  if (globalThis.libWrapper) libWrapper.unregister(MODULE_ID, TARGET, false);
}

function applyScaling(model, labels) {
  const range = model?.range;
  if (!range || !range.scalar) return; // non-scalar units (touch/self/any) have no distance

  const scene = canvas?.scene;
  const rangedMultiplier = scaleFor(scene, 'rangedAttacks');
  const reachMultiplier = scaleFor(scene, 'meleeReach');
  if (rangedMultiplier === 1 && reachMultiplier === 1) return;

  // `reach` is melee; `value`/`long` are ranged. On a melee weapon `value` is
  // still empty here — the activity folds reach into it during prepareFinalData,
  // after this runs — so scaling all three keeps that fold consistent whichever
  // order it happens in.
  //
  // scaleFields is idempotent: preparation can run more than once without a
  // reset in between, and plain multiplication would compound each time.
  scaleFields(range, ['reach'], reachMultiplier);
  scaleFields(range, ['value', 'long'], rangedMultiplier);

  rebuildLabels(range, labels);
}

/**
 * The labels were formatted from the pre-scaling numbers inside the wrapped
 * call, so they have to be rebuilt. Calling the original again is not an option
 * — it would re-evaluate the formula and discard the scaling.
 */
function rebuildLabels(range, labels) {
  if (!labels) return;
  const formatLength = globalThis.dnd5e?.utils?.formatLength;
  if (typeof formatLength !== 'function') return;
  if (!range.value) return;

  labels.range = formatLength(range.value, range.units);
  labels.rangeParts = formatLength(range.value, range.units, { parts: true });
  // Present in some dnd5e versions; only refresh it if the system built one.
  if ('description' in labels && labels.description) {
    labels.description = formatLength(range.value, range.units, { unitDisplay: 'long' });
  }
}

