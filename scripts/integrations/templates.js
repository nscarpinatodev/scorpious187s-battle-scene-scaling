import { scaleFor } from '../scaling.js';
import { log } from '../logger.js';

/**
 * Spell / AoE template scaling.
 *
 * dnd5e fires `dnd5e.preCreateActivityTemplate` with a mutable templateData
 * before the placement preview is constructed (ability-template.mjs, verified
 * against dnd5e 5.2.5). Multiplying here means no libWrapper, no core patch,
 * and no persisted change to the item — the template is simply born large.
 */
export function registerTemplateScaling() {
  Hooks.on('dnd5e.preCreateActivityTemplate', (activity, templateData) => {
    // Templates are placed on the scene the user is looking at, which is the
    // scene whose scale should govern them.
    const multiplier = scaleFor(canvas?.scene, 'templates');
    if (multiplier === 1) return;

    const scale = v => (typeof v === 'number' && Number.isFinite(v) ? v * multiplier : v);

    templateData.distance = scale(templateData.distance);
    templateData.width = scale(templateData.width);

    // dnd5e stores the authored dimensions separately and reads them back when
    // re-rendering the template (notably for radius templates, which adjust
    // against token size). Leave these stale and the shape can snap back to
    // unscaled on refresh. `adjustedSize` is a boolean flag, not a measurement.
    const dims = templateData.flags?.dnd5e?.dimensions;
    if (dims) {
      dims.size = scale(dims.size);
      dims.width = scale(dims.width);
      dims.height = scale(dims.height);
    }

    log.debug(`scaled template x${multiplier}`, {
      activity: activity?.name,
      distance: templateData.distance,
      width: templateData.width,
    });
  });
}
