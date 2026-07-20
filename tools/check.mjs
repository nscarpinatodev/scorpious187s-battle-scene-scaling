/**
 * Pre-flight checks. Run with `node tools/check.mjs` before building.
 *
 * Foundry cannot run on this machine, so these cover the failure modes that
 * otherwise only surface as a console error on the server.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const root = path.resolve(import.meta.dirname, '..');
let failures = 0;

function fail(msg) {
  console.error(`  FAIL  ${msg}`);
  failures++;
}
function pass(msg) {
  console.log(`  ok    ${msg}`);
}

function walk(dir, ext, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, ext, out);
    else if (ext.test(entry.name)) out.push(rel);
  }
  return out;
}

// ── 1. ESM syntax ────────────────────────────────────────────────────────────
// `node --check` parses as CommonJS for .js files, so copy to .mjs first.
console.log('\nESM syntax');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bss-check-'));
  for (const file of walk('scripts', /\.js$/)) {
    const staged = path.join(tmp, file.replace(/[\\/]/g, '_') + '.mjs');
    fs.copyFileSync(path.join(root, file), staged);
    try {
      execFileSync(process.execPath, ['--check', staged], { stdio: 'pipe' });
    } catch (err) {
      fail(`${file}\n${String(err.stderr ?? err).split('\n').slice(0, 4).join('\n')}`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!failures) pass('all scripts parse as ES modules');
}

// ── 2. JSON validity + byte-order marks ──────────────────────────────────────
// A BOM makes JSON.parse throw, so Foundry cannot read a manifest that has one
// and the module fails to load with no useful error. PowerShell 5.1 writes one
// by default from Set-Content -Encoding utf8, which is exactly how it happens.
console.log('\nJSON');
for (const file of ['module.json', 'lang/en.json']) {
  const buf = fs.readFileSync(path.join(root, file));
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    fail(`${file} — starts with a UTF-8 BOM; Foundry cannot parse it`);
    continue;
  }
  try {
    JSON.parse(buf.toString('utf8'));
    pass(file);
  } catch (err) {
    fail(`${file} — ${err.message}`);
  }
}

// ── 3. Localization keys ─────────────────────────────────────────────────────
console.log('\nLocalization keys');
{
  const defined = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'lang/en.json'), 'utf8'))));
  const used = new Map();
  for (const file of [...walk('scripts', /\.js$/), ...walk('templates', /\.hbs$/)]) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [key] of src.matchAll(/S187BSS\.[A-Za-z0-9_.]+/g)) {
      if (!used.has(key)) used.set(key, file);
    }
  }
  const missing = [...used].filter(([k]) => !defined.has(k));
  const orphaned = [...defined].filter(k => !used.has(k));
  for (const [key, file] of missing) fail(`missing key ${key} (used in ${file})`);
  for (const key of orphaned) console.warn(`  warn  defined but unused: ${key}`);
  if (!missing.length) pass(`${used.size} keys referenced, all defined`);
}

// ── 4. Handlebars single-root ────────────────────────────────────────────────
// HandlebarsApplicationMixin throws "Template part must render a single HTML
// element" if a PART template has sibling roots. This is the check that would
// have caught that before it reached the server.
console.log('\nHandlebars part structure');
for (const file of walk('templates', /\.hbs$/)) {
  const src = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/\{\{![\s\S]*?\}\}/g, '')  // handlebars comments
    .replace(/\{\{[\s\S]*?\}\}/g, '');  // expressions and block helpers

  const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img',
    'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  let depth = 0;
  let roots = 0;
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClose] = m;
    const isVoid = voids.has(tag.toLowerCase()) || selfClose === '/';
    if (closing) {
      depth--;
    } else {
      if (depth === 0) roots++;
      if (!isVoid) depth++;
    }
    void attrs;
  }

  if (roots === 1) pass(`${file} — single root`);
  else fail(`${file} — renders ${roots} root elements (must be exactly 1)`);
}

// ── 5. Idempotent scaling behaviour ──────────────────────────────────────────
// scale-util has no Foundry dependency, so its actual behaviour can be tested
// rather than reasoned about. These cases are the two bugs that shipped in
// 0.3.0: compounding on repeated preparation, and a multiplier change scaling
// the already-scaled value.
console.log('\nScaling behaviour');
{
  const { scaleFields } = await import(
    'file://' + path.join(root, 'scripts/scale-util.js').replace(/\\/g, '/')
  );

  const check = (label, actual, expected) => {
    if (actual === expected) pass(`${label} → ${actual}`);
    else fail(`${label} → got ${actual}, expected ${expected}`);
  };

  // 30 ft at x10 scales once.
  const a = { walk: 30 };
  scaleFields(a, ['walk'], 10);
  check('30 x10', a.walk, 300);

  // Preparing again without a reset must not compound (bug 1: gave 3000).
  scaleFields(a, ['walk'], 10);
  scaleFields(a, ['walk'], 10);
  check('30 x10, prepared 3 times', a.walk, 300);

  // Changing the multiplier rescales from the base, not the scaled value
  // (bug 2: gave 300 x20 = 6000).
  scaleFields(a, ['walk'], 20);
  check('then x20', a.walk, 600);

  // Back down again, still from base.
  scaleFields(a, ['walk'], 2);
  check('then x2', a.walk, 60);

  // If something else recomputes the field, that becomes the new base.
  a.walk = 40;
  scaleFields(a, ['walk'], 10);
  check('external change to 40, then x10', a.walk, 400);

  // Zero means "unlimited" for sight range and must be left alone.
  const b = { range: 0, dim: 20 };
  scaleFields(b, ['range', 'dim'], 4);
  check('sight range 0 untouched', b.range, 0);
  check('light dim 20 x4', b.dim, 80);

  // A multiplier of 1 is a no-op.
  const c = { walk: 30 };
  scaleFields(c, ['walk'], 1);
  check('x1 no-op', c.walk, 30);

  // The bookkeeping must not be enumerable, or it would serialize into
  // document data.
  const d = { walk: 30 };
  scaleFields(d, ['walk'], 4);
  check('no enumerable bookkeeping', Object.keys(d).join(','), 'walk');
  check('survives JSON round-trip', JSON.stringify(d), '{"walk":120}');
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('');
if (failures) {
  console.error(`${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('All checks passed.\n');
