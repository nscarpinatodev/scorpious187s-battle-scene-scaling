import { MODULE_ID } from '../constants.js';
import { scaleFor } from '../scaling.js';
import { scaleFields } from '../scale-util.js';
import { log } from '../logger.js';

/**
 * Movement speed scaling.
 *
 * `AttributesFields.prepareMovement` resolves every speed formula and applies
 * reductions (exhaustion, encumbrance, difficult terrain rules) in one pass,
 * and dnd5e invokes it as `AttributesFields.prepareMovement.call(this, …)` —
 * a property lookup on the class at each of its three call sites, so
 * libWrapper intercepts it the same way it does RangeField.
 *
 * Scaling *after* the wrapped call is deliberate. A 10 ft exhaustion reduction
 * is a distance like any other, so it should scale too: base 30 minus 10 gives
 * 20, then x4 gives 80. Scaling first and reducing after would leave the
 * penalty at its unscaled size and quietly change the maths.
 */

const TARGET = 'dnd5e.dataModels.actor.AttributesFields.prepareMovement';

export function registerMovementScaling() {
  if (!globalThis.libWrapper) return false;

  libWrapper.register(MODULE_ID, TARGET, function (wrapped, ...args) {
    const result = wrapped(...args);

    try {
      const multiplier = scaleFor(canvas?.scene, 'movement');
      if (multiplier !== 1) applyScaling(this, multiplier);
    } catch (err) {
      // Data preparation runs constantly; a throw here would break every actor
      // in the world, so failure has to degrade to unscaled speeds.
      log.error('movement scaling failed; leaving speeds unscaled', err);
    }

    return result;
  }, 'WRAPPER');

  log.info('movement scaling active');
  return true;
}

export function unregisterMovementScaling() {
  if (globalThis.libWrapper) libWrapper.unregister(MODULE_ID, TARGET, false);
}

function applyScaling(model, multiplier) {
  const movement = model?.attributes?.movement;
  if (!movement) return;

  // Iterate the configured movement types rather than the object's own keys —
  // `movement` also carries units, hover, special, bonus, and a `fromSpecies`
  // record, none of which are distances.
  scaleFields(movement, Object.keys(CONFIG.DND5E.movementTypes ?? {}), multiplier);
}
