'use strict';

// Usage:
//   npm run ocr:accuracy -- --log logcat.txt      parse OCR_SPIKE lines from a saved logcat
//   npm run ocr:accuracy -- --adb                 read `adb logcat -d` directly
//   npm run ocr:accuracy -- --results file.json   re-score a file saved in tests/ocr-accuracy/results
// Exits with code 1 if any language is above the threshold (CLAUDE.md section 7: CER <= 10%).

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { characterErrors, summarize } = require('./accuracy');

const THRESHOLD = 0.1;
const LANGUAGES = ['ru', 'en', 'pl'];
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'fixtures', 'screenshots');
const RESULTS_DIR = path.join(__dirname, 'results');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : (process.argv[i + 1] ?? true);
}

function parseLog(text) {
  const byName = new Map();
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf('OCR_SPIKE {');
    if (at === -1) continue;
    try {
      const item = JSON.parse(line.slice(at + 'OCR_SPIKE '.length));
      byName.set(item.name, item);
    } catch {
      // truncated logcat line: ignore, the fixture is reported as missing
    }
  }
  return [...byName.values()];
}

function load() {
  if (arg('--results')) return JSON.parse(fs.readFileSync(arg('--results'), 'utf8')).results;
  if (arg('--log')) return parseLog(fs.readFileSync(arg('--log'), 'utf8'));
  if (arg('--adb')) {
    const out = execFileSync('adb', ['logcat', '-d'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    return parseLog(out);
  }
  return null;
}

const results = load();
if (!results) {
  console.log('ocr:accuracy: pass --log <file>, --adb or --results <file>. See docs/STATUS.md.');
  process.exit(0);
}

const expectedFiles = fs
  .readdirSync(SCREENSHOTS_DIR)
  .filter((f) => f.endsWith('.expected.txt'))
  .sort();

const rows = [];
for (const file of expectedFiles) {
  const name = file.replace('.expected.txt', '');
  const found = results.find((r) => r.name === name);
  if (!found || found.error !== undefined || typeof found.text !== 'string') {
    rows.push({ name, error: found?.error ?? 'no result' });
    continue;
  }
  const expected = fs.readFileSync(path.join(SCREENSHOTS_DIR, file), 'utf8');
  const { distance, refLength } = characterErrors(expected, found.text);
  rows.push({ name, distance, refLength, cer: distance / refLength });
}

const engine = results.find((r) => r.engine)?.engine ?? 'unknown';
console.log(`engine: ${engine}`);
for (const r of rows) {
  console.log(
    r.error
      ? `  ${r.name.padEnd(14)} ERROR ${r.error}`
      : `  ${r.name.padEnd(14)} CER ${(r.cer * 100).toFixed(1).padStart(5)}%  (${r.distance}/${r.refLength})`,
  );
}

const perLanguage = summarize(rows.filter((r) => !r.error));
let failed = rows.some((r) => r.error);
console.log(`per language (threshold ${THRESHOLD * 100}%):`);
for (const lang of LANGUAGES) {
  const agg = perLanguage[lang];
  if (!agg) {
    failed = true;
    console.log(`  ${lang}: no results  FAIL`);
    continue;
  }
  const ok = agg.cer <= THRESHOLD;
  if (!ok) failed = true;
  console.log(`  ${lang}: CER ${(agg.cer * 100).toFixed(1)}%  ${ok ? 'PASS' : 'FAIL'}`);
}

fs.mkdirSync(RESULTS_DIR, { recursive: true });
fs.writeFileSync(
  path.join(RESULTS_DIR, `${engine}.json`),
  JSON.stringify({ engine, threshold: THRESHOLD, perLanguage, rows, results }, null, 2) + '\n',
);
process.exit(failed ? 1 : 0);
