import {
  MODULE_ID, SETTING_PROFILES, SETTING_BASELINE, FLAG_PROFILE, FLAG_MULTIPLIER,
  MODE_AUTO, emptyCategories,
} from './constants.js';

/**
 * Scale resolution.
 *
 * Nothing here writes to actor or item data. Item derived data is world-global
 * rather than per-scene, so baking scaled values into the data model would
 * force a full re-derive on every scene change and would be wrong whenever a
 * player views a scene their token is not standing on. Instead every consumer
 * asks for the scale at the moment it needs it, against a specific scene.
 */

export function getProfiles() {
  try {
    const raw = game.settings.get(MODULE_ID, SETTING_PROFILES);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return []; // settings not registered yet (called before init completes)
  }
}

export function getProfile(id) {
  if (!id) return null;
  return getProfiles().find(p => p.id === id) ?? null;
}

/** The unscaled distance one grid square represents (5 ft by default). */
export function baselineDistance() {
  try {
    const value = Number(game.settings.get(MODULE_ID, SETTING_BASELINE));
    return Number.isFinite(value) && value > 0 ? value : 5;
  } catch {
    return 5;
  }
}

/**
 * Derive the multiplier from the scene's own grid.
 *
 * A scene set to 20 ft/square against a 5 ft baseline yields x4, which exactly
 * cancels the grid rescaling for scaled categories. Keeping this derived means
 * the grid distance and the multiplier cannot drift apart — editing the scene
 * grid is enough.
 */
export function autoMultiplier(scene) {
  const gridDistance = Number(scene?.grid?.distance);
  if (!Number.isFinite(gridDistance) || gridDistance <= 0) return 1;
  const ratio = gridDistance / baselineDistance();
  return ratio > 0 ? ratio : 1;
}

/**
 * Resolve the active scaling for a scene.
 * @returns {{profile: object|null, multiplier: number, categories: object}}
 */
export function sceneScaling(scene) {
  const inert = { profile: null, multiplier: 1, categories: emptyCategories(false) };
  if (!scene) return inert;

  const profile = getProfile(scene.getFlag(MODULE_ID, FLAG_PROFILE));
  if (!profile) return inert;

  // Precedence: explicit per-scene override, then the profile's mode. An
  // override always wins so a single odd scene never needs its own profile.
  const override = Number(scene.getFlag(MODULE_ID, FLAG_MULTIPLIER));
  let multiplier;
  if (Number.isFinite(override) && override > 0) multiplier = override;
  else if ((profile.mode ?? MODE_AUTO) === MODE_AUTO) multiplier = autoMultiplier(scene);
  else multiplier = Number(profile.multiplier) || 1;

  return {
    profile,
    multiplier,
    categories: { ...emptyCategories(false), ...(profile.categories ?? {}) },
  };
}

/**
 * The multiplier to apply for one category on one scene.
 * Returns 1 when scaling is off, so callers can early-out on `=== 1`.
 */
export function scaleFor(scene, category) {
  const { multiplier, categories } = sceneScaling(scene);
  if (multiplier === 1 || !categories[category]) return 1;
  return multiplier;
}

export function isScaled(scene) {
  return sceneScaling(scene).multiplier !== 1;
}
