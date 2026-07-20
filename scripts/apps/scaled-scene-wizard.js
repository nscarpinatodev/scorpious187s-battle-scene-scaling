import { MODULE_ID, FLAG_PROFILE, MODE_AUTO } from '../constants.js';
import { getProfiles, getProfile, baselineDistance } from '../scaling.js';
import { log } from '../logger.js';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * Creates (or converts to) a correctly configured scaled scene.
 *
 * Grid type, grid distance, and the profile flag have to agree with each other
 * or every distance on the scene is quietly wrong. Setting all three by hand in
 * two different dialogs is the obvious way to get that wrong, so this does it in
 * one step and shows the derived grid distance as you pick.
 */
export class ScaledSceneWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'bss-scaled-scene-wizard',
    tag: 'form',
    classes: ['bss', 'bss-scene-wizard'],
    window: { title: 'S187BSS.Wizard.Title', icon: 'fas fa-wand-magic-sparkles' },
    position: { width: 520, height: 'auto' },
    form: { handler: ScaledSceneWizard.#onSubmit, closeOnSubmit: true, submitOnChange: false },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/scaled-scene-wizard.hbs` },
  };

  /** @type {Scene|null} When set, the wizard converts this scene instead of creating one. */
  #target = null;

  constructor(options = {}) {
    super(options);
    this.#target = options.scene ?? null;
  }

  get title() {
    return this.#target
      ? game.i18n.format('S187BSS.Wizard.ConvertTitle', { name: this.#target.name })
      : game.i18n.localize('S187BSS.Wizard.Title');
  }

  async _prepareContext() {
    const profiles = getProfiles();
    const baseline = baselineDistance();
    return {
      isConvert: Boolean(this.#target),
      sceneName: this.#target?.name ?? '',
      gridSize: this.#target?.grid?.size ?? 100,
      currentDistance: this.#target?.grid?.distance ?? null,
      baseline,
      profiles: profiles.map(p => ({
        id: p.id,
        label: p.label,
        multiplier: p.multiplier,
        // Auto profiles derive their multiplier from the scene grid, but the
        // scene does not exist yet — so the wizard works the relationship
        // backwards and uses the profile's number to *set* the grid.
        gridDistance: round(baseline * (Number(p.multiplier) || 1)),
      })),
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // Keep the derived grid distance visible as the profile changes, so the
    // link between profile and grid is never a hidden calculation.
    const select = this.element.querySelector('[name="profileId"]');
    const readout = this.element.querySelector('[data-derived-distance]');
    if (!select || !readout) return;

    const update = () => {
      const profile = getProfile(select.value);
      const multiplier = Number(profile?.multiplier) || 1;
      readout.textContent = game.i18n.format('S187BSS.Wizard.Derived', {
        distance: round(baselineDistance() * multiplier),
        units: canvas?.scene?.grid?.units || game.i18n.localize('S187BSS.Wizard.Units'),
        multiplier,
      });
    };
    select.addEventListener('change', update);
    update();
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const profile = getProfile(data.profileId);
    if (!profile) return ui.notifications.warn(game.i18n.localize('S187BSS.Wizard.NoProfile'));

    const multiplier = Number(profile.multiplier) || 1;
    const gridDistance = round(baselineDistance() * multiplier);
    const gridSize = Number(data.gridSize) || 100;

    const gridData = {
      type: CONST.GRID_TYPES.GRIDLESS,
      distance: gridDistance,
      size: gridSize,
    };

    if (this.#target) return ScaledSceneWizard.#convert(this.#target, gridData, profile);

    const name = String(data.name ?? '').trim() || game.i18n.localize('S187BSS.Wizard.DefaultName');
    const createData = {
      name,
      grid: gridData,
      flags: { [MODULE_ID]: { [FLAG_PROFILE]: profile.id } },
    };
    if (data.background) createData.background = { src: data.background };

    const scene = await Scene.create(createData);
    if (!scene) return;

    log.info(`created scaled scene "${name}" — gridless, ${gridDistance} per ${gridSize}px (x${multiplier})`);
    ui.notifications.info(game.i18n.format('S187BSS.Wizard.Created', { name, distance: gridDistance }));
    scene.sheet?.render(true);
  }

  /**
   * Convert an existing scene. This reinterprets every distance already on the
   * scene, so it asks first and spells out what changes.
   */
  static async #convert(scene, gridData, profile) {
    const before = scene.grid.distance;
    const wasGridless = scene.grid.type === CONST.GRID_TYPES.GRIDLESS;

    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize('S187BSS.Wizard.ConfirmTitle') },
      content: `
        <p>${game.i18n.format('S187BSS.Wizard.ConfirmBody', {
          name: foundry.utils.escapeHTML(scene.name),
          profile: foundry.utils.escapeHTML(profile.label),
        })}</p>
        <ul>
          <li>${game.i18n.format('S187BSS.Wizard.ConfirmGrid', {
            before, after: gridData.distance,
          })}</li>
          ${wasGridless ? '' : `<li>${game.i18n.localize('S187BSS.Wizard.ConfirmGridless')}</li>`}
        </ul>
        <p class="notes">${game.i18n.localize('S187BSS.Wizard.ConfirmTokens')}</p>`,
    });
    if (!confirmed) return;

    await scene.update({
      grid: gridData,
      [`flags.${MODULE_ID}.${FLAG_PROFILE}`]: profile.id,
    });

    log.info(`converted "${scene.name}" to scaled: ${before} -> ${gridData.distance}`);
    ui.notifications.info(game.i18n.format('S187BSS.Wizard.Converted', {
      name: scene.name, distance: gridData.distance,
    }));
  }
}

/** Trim floating-point noise from baseline x multiplier (1.5 x 3 and friends). */
function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Sidebar and context-menu entry points.
 * Hook names verified against v13.
 */
export function registerWizardEntryPoints() {
  Hooks.on('renderSceneDirectory', (app, html) => {
    if (!game.user.isGM) return;
    try {
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root || root.querySelector('.bss-create-scaled')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bss-create-scaled';
      button.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i> ${game.i18n.localize('S187BSS.Wizard.CreateButton')}`;
      button.addEventListener('click', () => new ScaledSceneWizard().render(true));

      // Header layout varies across v13 builds; fall back to prepending so the
      // button is always reachable even if the expected container moves.
      const header = root.querySelector('.directory-header .header-actions, .directory-header, .header-actions');
      if (header) header.appendChild(button);
      else root.prepend(button);
    } catch (err) {
      log.error('failed to add scene directory button', err);
    }
  });

  Hooks.on('getSceneContextOptions', (app, options) => {
    options.push({
      name: game.i18n.localize('S187BSS.Wizard.ConvertOption'),
      icon: '<i class="fas fa-expand-arrows-alt"></i>',
      condition: () => game.user.isGM,
      callback: li => {
        const id = li.dataset?.entryId ?? li.dataset?.documentId ?? li.getAttribute?.('data-entry-id');
        const scene = game.scenes.get(id);
        if (scene) new ScaledSceneWizard({ scene }).render(true);
      },
    });
  });
}
