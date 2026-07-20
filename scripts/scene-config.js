import { MODULE_ID, FLAG_PROFILE, FLAG_MULTIPLIER } from './constants.js';
import { getProfiles } from './scaling.js';
import { log } from './logger.js';

/**
 * Inject scaling controls into Scene Config.
 *
 * The inputs are named `flags.<module>.<key>`, which Foundry's document sheet
 * submission turns into a flag update for free — no submit handler needed.
 */
export function registerSceneConfig() {
  Hooks.on('renderSceneConfig', (app, html) => {
    try {
      // v13 hands AppV2 sheets a raw HTMLElement; older/other sheets may pass
      // a jQuery object. Normalise before touching the DOM.
      const root = html instanceof HTMLElement ? html : html?.[0];
      if (!root || root.querySelector(`[data-${MODULE_ID}]`)) return;

      const scene = app.document;
      const current = scene?.getFlag(MODULE_ID, FLAG_PROFILE) ?? '';
      const override = scene?.getFlag(MODULE_ID, FLAG_MULTIPLIER) ?? '';

      const options = ['<option value="">' + game.i18n.localize('S187BSS.Scene.None') + '</option>']
        .concat(getProfiles().map(p => {
          const selected = p.id === current ? ' selected' : '';
          return `<option value="${p.id}"${selected}>${foundry.utils.escapeHTML(p.label)} (&times;${p.multiplier})</option>`;
        }))
        .join('');

      // Scaled scenes are meant to be gridless: on a rescaled square grid a
      // 30 ft move lands on 1.5 squares, so tokens snap wrong and counting
      // squares stops working. Warn rather than block — there is room to
      // experiment, and blocking a save is worse than a visible caution.
      const needsGridless = current && scene.grid?.type !== CONST.GRID_TYPES.GRIDLESS;
      const warning = needsGridless
        ? `<p class="notification warning bss-grid-warning">
             ${game.i18n.localize('S187BSS.Scene.GridWarning')}
             <button type="button" class="bss-make-gridless">
               ${game.i18n.localize('S187BSS.Scene.MakeGridless')}
             </button>
           </p>`
        : '';

      const fieldset = document.createElement('fieldset');
      fieldset.setAttribute(`data-${MODULE_ID}`, '');
      fieldset.innerHTML = `
        <legend>${game.i18n.localize('S187BSS.Scene.Legend')}</legend>
        ${warning}
        <div class="form-group">
          <label>${game.i18n.localize('S187BSS.Scene.Profile')}</label>
          <div class="form-fields">
            <select name="flags.${MODULE_ID}.${FLAG_PROFILE}">${options}</select>
          </div>
          <p class="hint">${game.i18n.localize('S187BSS.Scene.ProfileHint')}</p>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize('S187BSS.Scene.Override')}</label>
          <div class="form-fields">
            <input type="number" step="0.1" min="0"
              name="flags.${MODULE_ID}.${FLAG_MULTIPLIER}" value="${override}"
              placeholder="${game.i18n.localize('S187BSS.Scene.OverridePlaceholder')}">
          </div>
          <p class="hint">${game.i18n.localize('S187BSS.Scene.OverrideHint')}</p>
        </div>`;

      // Place it above the save button wherever that lives. Falling back to the
      // form (or the root itself, when the sheet's root element *is* the form)
      // keeps this working if the footer markup shifts between v13 builds.
      const footer = root.querySelector('footer, .sheet-footer, .form-footer');
      if (footer?.parentElement) footer.parentElement.insertBefore(fieldset, footer);
      else (root.querySelector('form') ?? root).appendChild(fieldset);

      // Flip the sheet's own grid-type control rather than updating the
      // document, so this cooperates with the open form instead of racing it.
      // The GM still has to save, which keeps the change reviewable.
      fieldset.querySelector('.bss-make-gridless')?.addEventListener('click', () => {
        const gridType = root.querySelector('[name="grid.type"]');
        if (gridType) {
          gridType.value = String(CONST.GRID_TYPES.GRIDLESS);
          gridType.dispatchEvent(new Event('change', { bubbles: true }));
          fieldset.querySelector('.bss-grid-warning')?.remove();
          ui.notifications.info(game.i18n.localize('S187BSS.Scene.GridlessPending'));
        } else {
          // Grid controls live on another tab in some builds; fall back to a
          // direct update so the button is never a dead end.
          scene.update({ 'grid.type': CONST.GRID_TYPES.GRIDLESS });
        }
      });

      app.setPosition?.({ height: 'auto' });
    } catch (err) {
      // A broken injection must never block the GM from editing scenes.
      log.error('failed to inject scene config controls', err);
    }
  });
}
