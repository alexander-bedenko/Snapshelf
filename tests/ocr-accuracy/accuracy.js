'use strict';

// Whitespace is collapsed: line breaks and spacing are a layout concern, not a recognition error.
function normalize(text) {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function levenshtein(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[y.length];
}

function characterErrors(expected, actual) {
  const ref = normalize(expected);
  const hyp = normalize(actual);
  return { distance: levenshtein(ref, hyp), refLength: Array.from(ref).length };
}

function cer(expected, actual) {
  const { distance, refLength } = characterErrors(expected, actual);
  return refLength === 0 ? (distance === 0 ? 0 : 1) : distance / refLength;
}

// Fixture names are "<lang>-<case>"; the part before the first dash is the language.
function languageOf(name) {
  return name.split('-')[0];
}

function summarize(items) {
  const perLanguage = {};
  for (const item of items) {
    const lang = languageOf(item.name);
    const agg = (perLanguage[lang] ??= { distance: 0, refLength: 0, count: 0 });
    agg.distance += item.distance;
    agg.refLength += item.refLength;
    agg.count += 1;
  }
  for (const agg of Object.values(perLanguage)) {
    agg.cer = agg.refLength === 0 ? 0 : agg.distance / agg.refLength;
  }
  return perLanguage;
}

// A log can hold several engine runs (ocr-spike logs `run`); older logs only have `engine`.
function runOf(item) {
  return item.run ?? item.engine;
}

/** OCR_SPIKE lines from logcat → result items; the last line per (run, fixture) wins. */
function parseLog(text) {
  const byKey = new Map();
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf('OCR_SPIKE {');
    if (at === -1) continue;
    try {
      const item = JSON.parse(line.slice(at + 'OCR_SPIKE '.length));
      byKey.set(`${runOf(item) ?? ''}|${item.name}`, item);
    } catch {
      // truncated logcat line: ignore, the fixture is reported as missing
    }
  }
  return [...byKey.values()];
}

/**
 * Picks one run. Without `wanted` the log must contain a single run.
 * Items without run/engine (old-style error lines) belong to every run.
 */
function selectRun(results, wanted) {
  const runs = [...new Set(results.map(runOf).filter((r) => r !== undefined))];
  const id = wanted ?? (runs.length <= 1 ? (runs[0] ?? 'unknown') : undefined);
  if (id === undefined) return { error: `several runs in the log (${runs.join(', ')})`, runs };
  const items = results.filter((r) => runOf(r) === id || runOf(r) === undefined);
  if (items.length === 0) return { error: `no results for run "${id}"`, runs };
  return { id, items, runs };
}

module.exports = {
  normalize,
  levenshtein,
  characterErrors,
  cer,
  languageOf,
  summarize,
  parseLog,
  selectRun,
};
