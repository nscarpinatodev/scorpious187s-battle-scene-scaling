import { MODULE_ID } from '../constants.js';
import { scaleFor } from '../scaling.js';
import { scaleFields } from '../scale-util.js';
import { log } from '../logger.js';

/**
 * Token vision and light scaling.
 *
 * The line drawn here is between distances that belong to the *creature* and
 * distances that belong to the *scene*:
 *
 *   - Darkvision, blindsight, and a torch the creature is carrying are
 *     creature properties. They arrive on a scaled scene still expressed in
 *     normal-scale feet, so they need scaling to keep their usual reach.
 *   - Ambient lights, walls, and scene darkness were placed by the GM *on* the
 *     scaled scene, already at that scene's scale. Scaling them would double up.
 *
 * So this touches token sight, token light, and detection modes, and nothing
 * else. There is no dnd5e equivalent of RangeField here — `SensesField` has no
 * `prepareData` — so the interception point is the TokenDocument's own
 * preparation, which is also what makes it non-destructive: values are modified
 * in memory after each re-prepare and never written back to the database.
 */

const TARGET = 'CONFIG.Token.documentClass.prototype.prepareBaseData';

export function registerVisionScaling() {
  if (!globalThis.libWrapper) return false;

  libWrapper.register(MODULE_ID, TARGET, function (wrapped, ...args) {
    const result = wrapped(...args);

    try {
      // `this.parent` is the scene the token belongs to. Use it rather than
      // the viewed scene so tokens on other scenes are never mis-scaled — the
      // TokenDocument knows where it lives, unlike actor-derived data.
      const multiplier = scaleFor(this.parent ?? canvas?.scene, 'vision');
      if (multiplier !== 1) applyScaling(this, multiplier);
    } catch (err) {
      log.error('vision scaling failed; leaving token vision unscaled', err);
    }

    return result;
  }, 'WRAPPER');

  log.info('vision scaling active');
  return true;
}

export function unregisterVisionScaling() {
  if (globalThis.libWrapper) libWrapper.unregister(MODULE_ID, TARGET, false);
}

function applyScaling(token, multiplier) {
  // Sight radius. A range of 0 means "unlimited" in Foundry; scaleFields only
  // touches positive numbers, so that is deliberately left alone.
  if (token.sight) scaleFields(token.sight, ['range'], multiplier);

  // Light the token itself emits — a carried torch, a glowing weapon.
  if (token.light) scaleFields(token.light, ['dim', 'bright'], multiplier);

  // Detection modes carry their own ranges (blindsight, tremorsense, see
  // invisibility) and are what dnd5e populates from the actor's senses.
  for (const mode of token.detectionModes ?? []) {
    scaleFields(mode, ['range'], multiplier);
  }
}
