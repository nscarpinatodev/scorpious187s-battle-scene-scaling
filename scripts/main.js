/**
 * Scorpious187's Battle Scene Scaling — entry point.
 * Foundry VTT v13, dnd5e 5.x.
 */

import { MODULE_ID } from './constants.js';
import { registerSettings } from './settings.js';
import { registerSceneConfig } from './scene-config.js';
import { registerTemplateScaling } from './integrations/templates.js';
import { registerRangeScaling } from './integrations/ranges.js';
import { registerMovementScaling } from './integrations/movement.js';
import { registerVisionScaling } from './integrations/vision.js';
import { registerInvalidation, invalidate } from './invalidate.js';
import { ScaledSceneWizard, registerWizardEntryPoints } from './apps/scaled-scene-wizard.js';
import { sceneScaling, scaleFor, autoMultiplier } from './scaling.js';
import { log } from './logger.js';

let wrappersActive = false;

Hooks.once('init', () => {
  registerSettings();
  registerSceneConfig();
  registerWizardEntryPoints();

  if (game.system.id !== 'dnd5e') {
    log.warn(`system is "${game.system.id}"; dnd5e integrations are inactive`);
  } else {
    // Templates need no libWrapper — dnd5e provides a hook.
    registerTemplateScaling();

    // Everything else has no hook and must wrap prepared data.
    wrappersActive = [
      registerRangeScaling(),
      registerMovementScaling(),
      registerVisionScaling(),
    ].every(Boolean);

    if (wrappersActive) registerInvalidation();
    else log.warn('libWrapper not found — range, movement, and vision scaling disabled');
  }

  game.modules.get(MODULE_ID).api = Object.freeze({
    sceneScaling,
    scaleFor,
    autoMultiplier,
    openWizard: (scene = null) => new ScaledSceneWizard(scene ? { scene } : {}).render(true),
    refresh: invalidate,
  });

  log.info('Initialized');
});

Hooks.once('ready', () => {
  if (game.system.id === 'dnd5e' && !wrappersActive && game.user.isGM) {
    ui.notifications.warn(game.i18n.localize('S187BSS.NoLibWrapper'));
  }

  const { profile, multiplier } = sceneScaling(canvas?.scene);
  if (profile) {
    log.info(`active scene "${canvas.scene.name}": ${profile.label} (x${multiplier})`);
    // The first canvasReady can fire before settings are readable, so make sure
    // the opening scene's scale actually reaches derived data.
    if (wrappersActive) invalidate();
  }
});
