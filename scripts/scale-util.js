/**
 * Idempotent in-place scaling.
 *
 * dnd5e's preparation steps overwrite derived values in place and rely on the
 * data model being re-initialized from source before each pass. Their own
 * operations tolerate a repeated `prepareData()` because they are idempotent —
 * `simplifyBonus(30)` is still 30. Multiplication is not: run it twice and a
 * x10 scene turns 30 ft into 3000.
 *
 * So rather than multiplying whatever is currently there, remember both the
 * unscaled base and the value we produced from it. If the field still holds our
 * own output, the base is re-scaled from scratch instead of compounding; if
 * something else has since recomputed it, that new value becomes the base.
 * This also makes a multiplier change correct — x10 to x20 rescales from 30,
 * not from 300.
 */

const STORE = Symbol.for('scorpious187s-battle-scene-scaling.scaled');

function storeFor(container) {
  let store = container[STORE];
  if (!store) {
    store = { base: {}, scaled: {} };
    // Non-enumerable so it never lands in serialized document data.
    Object.defineProperty(container, STORE, {
      value: store, enumerable: false, writable: true, configurable: true,
    });
  }
  return store;
}

/**
 * Scale numeric fields on an object in place, idempotently.
 * @param {object} container   Object holding the fields.
 * @param {string[]} keys      Field names to scale.
 * @param {number} multiplier  Factor to apply.
 */
export function scaleFields(container, keys, multiplier) {
  if (!container || !Number.isFinite(multiplier) || multiplier === 1) return;
  const store = storeFor(container);

  for (const key of keys) {
    const current = container[key];
    // Zero is meaningful in Foundry (an unlimited sight range), so only
    // positive finite numbers are distances worth scaling.
    if (typeof current !== 'number' || !Number.isFinite(current) || current <= 0) continue;

    const base = current === store.scaled[key] ? store.base[key] : current;
    const next = base * multiplier;

    container[key] = next;
    store.base[key] = base;
    store.scaled[key] = next;
  }
}
