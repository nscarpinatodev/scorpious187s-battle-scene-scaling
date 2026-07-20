import { MODULE_ID, SETTING_PROFILES, SETTING_BASELINE, SETTING_DEBUG, DEFAULT_PROFILES } from './constants.js';
import { ProfileEditor } from './apps/profile-editor.js';
import { invalidate } from './invalidate.js';

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTING_PROFILES, {
    scope: 'world',
    config: false, // edited through the profile editor menu
    type: Array,
    default: foundry.utils.deepClone(DEFAULT_PROFILES),
  });

  game.settings.register(MODULE_ID, SETTING_BASELINE, {
    name: game.i18n.localize('S187BSS.Settings.Baseline'),
    hint: game.i18n.localize('S187BSS.Settings.BaselineHint'),
    scope: 'world',
    config: true,
    type: Number,
    default: 5,
    onChange: () => invalidate(),
  });

  game.settings.register(MODULE_ID, SETTING_DEBUG, {
    name: game.i18n.localize('S187BSS.Settings.Debug'),
    hint: game.i18n.localize('S187BSS.Settings.DebugHint'),
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings.registerMenu(MODULE_ID, 'profileEditor', {
    name: game.i18n.localize('S187BSS.Editor.Title'),
    label: game.i18n.localize('S187BSS.Editor.Open'),
    hint: game.i18n.localize('S187BSS.Editor.MenuHint'),
    icon: 'fas fa-expand-arrows-alt',
    type: ProfileEditor,
    restricted: true,
  });
}
