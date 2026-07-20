import {
  MODULE_ID, SETTING_PROFILES, CATEGORIES, CATEGORY_KEYS, DEFAULT_PROFILES,
  MODE_AUTO, MODE_FIXED, emptyCategories,
} from '../constants.js';
import { getProfiles, baselineDistance } from '../scaling.js';
import { invalidate } from '../invalidate.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Editor for the world's scaling profiles.
 *
 * Add/delete operate on an in-memory working copy so a GM can restructure the
 * list without losing unsaved edits to the rows they are keeping.
 */
export class ProfileEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'bss-profile-editor',
    tag: 'form',
    classes: ['bss', 'bss-profile-editor'],
    window: { title: 'S187BSS.Editor.Title', icon: 'fas fa-expand-arrows-alt', resizable: true },
    position: { width: 680, height: 'auto' },
    form: { handler: ProfileEditor.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: {
      addProfile: ProfileEditor.#onAddProfile,
      deleteProfile: ProfileEditor.#onDeleteProfile,
      resetDefaults: ProfileEditor.#onResetDefaults,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/profile-editor.hbs`, scrollable: [''] },
  };

  /** @type {object[]|null} Working copy; null until first render. */
  #working = null;

  get working() {
    this.#working ??= foundry.utils.deepClone(getProfiles());
    return this.#working;
  }

  async _prepareContext() {
    return {
      baseline: baselineDistance(),
      profiles: this.working.map(p => ({
        ...p,
        isAuto: (p.mode ?? MODE_AUTO) === MODE_AUTO,
        categories: { ...emptyCategories(false), ...(p.categories ?? {}) },
      })),
      categories: CATEGORY_KEYS.map(key => ({
        key,
        label: game.i18n.localize(CATEGORIES[key].label),
        supported: CATEGORIES[key].supported,
      })),
    };
  }

  /** Pull the current DOM state into the working copy before re-rendering. */
  #syncFromForm() {
    const form = this.element;
    if (!form) return;
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);
    const rows = data.profiles ?? {};
    this.#working = Object.keys(rows)
      .sort((a, b) => Number(a) - Number(b))
      .map(i => normalizeProfile(rows[i]));
  }

  static #onAddProfile() {
    this.#syncFromForm();
    this.#working.push({
      id: foundry.utils.randomID(),
      label: game.i18n.localize('S187BSS.Editor.NewProfile'),
      mode: MODE_AUTO,
      multiplier: 2,
      categories: { ...emptyCategories(false), templates: true },
    });
    this.render();
  }

  static #onDeleteProfile(event, target) {
    this.#syncFromForm();
    const index = Number(target.dataset.index);
    if (Number.isInteger(index)) this.#working.splice(index, 1);
    this.render();
  }

  static async #onResetDefaults() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('S187BSS.Editor.ResetTitle') },
      content: `<p>${game.i18n.localize('S187BSS.Editor.ResetPrompt')}</p>`,
    });
    if (!confirmed) return;
    this.#working = foundry.utils.deepClone(DEFAULT_PROFILES);
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const rows = foundry.utils.expandObject(formData.object).profiles ?? {};
    const profiles = Object.keys(rows)
      .sort((a, b) => Number(a) - Number(b))
      .map(i => normalizeProfile(rows[i]))
      .filter(p => p.label.trim().length);
    await game.settings.set(MODULE_ID, SETTING_PROFILES, profiles);
    // Changing a multiplier or category has to re-derive everything; the cached
    // values were computed against the old profile.
    invalidate();
  }
}

/** Coerce a submitted row into a well-formed profile. */
function normalizeProfile(row = {}) {
  const multiplier = Number(row.multiplier);
  return {
    // Preserve the id so scenes already pointing at this profile keep working.
    id: row.id || foundry.utils.randomID(),
    label: String(row.label ?? '').trim(),
    mode: row.mode === MODE_FIXED ? MODE_FIXED : MODE_AUTO,
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1,
    categories: {
      ...emptyCategories(false),
      ...Object.fromEntries(CATEGORY_KEYS.map(k => [k, Boolean(row.categories?.[k])])),
    },
  };
}
