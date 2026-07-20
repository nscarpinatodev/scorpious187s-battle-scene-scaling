export const MODULE_ID = 'scorpious187s-battle-scene-scaling';

// Scene flags. Written directly by the Scene Config injection, so these strings
// also appear as input `name` attributes — keep them in sync with scene-config.js.
export const FLAG_PROFILE = 'profileId';
export const FLAG_MULTIPLIER = 'multiplier';

export const SETTING_PROFILES = 'profiles';
export const SETTING_BASELINE = 'baselineDistance';
export const SETTING_DEBUG = 'debug';

/**
 * Multiplier modes.
 *
 * The intended workflow pairs a scaled scene grid with a matching module
 * multiplier: set the scene to 20 ft/square and the module to x4 and the two
 * cancel, so a 20 ft burst still covers its normal four squares while the map
 * represents four times the ground. Categories left unscaled shrink instead —
 * a 30 ft move becomes 1.5 squares rather than 6.
 *
 * AUTO derives the multiplier from `scene.grid.distance` so those two numbers
 * cannot drift apart. FIXED uses the profile's own number, for scenes that
 * want scaling without a rescaled grid.
 */
export const MODE_AUTO = 'auto';
export const MODE_FIXED = 'fixed';

/**
 * Scaling categories. Each profile enables these independently — that
 * selectivity is the whole reason this module exists rather than just
 * lowering the scene's grid distance.
 *
 * `supported` marks what is actually wired up in this version. Unsupported
 * categories still store their toggle so profiles survive the upgrade, but
 * they are shown disabled in the editor rather than silently doing nothing.
 */
export const CATEGORIES = {
  templates: { label: 'S187BSS.Category.Templates', supported: true },
  rangedAttacks: { label: 'S187BSS.Category.RangedAttacks', supported: true },
  meleeReach: { label: 'S187BSS.Category.MeleeReach', supported: true },
  movement: { label: 'S187BSS.Category.Movement', supported: true },
  vision: { label: 'S187BSS.Category.Vision', supported: true },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

/**
 * Shipped presets.
 *
 * Read an enabled category as "keep this at normal tabletop scale" and a
 * disabled one as "let this shrink with the map". Dragon Battle deliberately
 * leaves movement off: on a x4 grid the PCs cross a quarter of the squares
 * they normally would, which is the point of fighting something that size.
 * Space Combat scales movement back up because ships are meant to cover
 * ground; Kaiju sits between the two.
 */
export const DEFAULT_PROFILES = [
  {
    id: 'dragon-battle',
    label: 'Dragon Battle',
    mode: MODE_AUTO,
    multiplier: 4,
    categories: { templates: true, rangedAttacks: true, meleeReach: true, movement: false, vision: false },
  },
  {
    id: 'kaiju',
    label: 'Kaiju',
    mode: MODE_AUTO,
    multiplier: 10,
    categories: { templates: true, rangedAttacks: true, meleeReach: true, movement: true, vision: false },
  },
  {
    id: 'space-combat',
    label: 'Space Combat',
    mode: MODE_AUTO,
    multiplier: 20,
    categories: { templates: true, rangedAttacks: true, meleeReach: false, movement: true, vision: true },
  },
];

export function emptyCategories(value = false) {
  return Object.fromEntries(CATEGORY_KEYS.map(k => [k, value]));
}
