import { MODULE_ID, SETTING_DEBUG } from './constants.js';

// scorpious187s-lib is an optional dependency here — the test server should be
// able to run this module on its own. Use the family logger when the library is
// present, otherwise fall back to a local one with the same shape.
function libLogger() {
  const api = game.modules.get('scorpious187s-lib')?.api;
  return api?.utils?.makeLogger?.(MODULE_ID) ?? null;
}

let cached = null;

function debugEnabled() {
  try {
    return game.settings.get(MODULE_ID, SETTING_DEBUG);
  } catch {
    return false;
  }
}

export const log = {
  info: (...args) => (cached ??= libLogger())?.log?.(...args) ?? console.log(`${MODULE_ID} |`, ...args),
  warn: (...args) => console.warn(`${MODULE_ID} |`, ...args),
  error: (...args) => console.error(`${MODULE_ID} |`, ...args),
  debug: (...args) => {
    if (debugEnabled()) console.log(`${MODULE_ID} | [debug]`, ...args);
  },
};
