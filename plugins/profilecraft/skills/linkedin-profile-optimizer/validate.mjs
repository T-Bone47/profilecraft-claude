#!/usr/bin/env node
// Deterministic checks for a LinkedIn profile draft (models cannot count characters reliably).
// Usage: node validate.mjs <draft.json | -> [facts-file]   Exit 0 ok, 1 problems found, 2 bad input.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Limits are conservative defaults. LinkedIn may change them; verify in LinkedIn's own editor.
export const LIMITS = { headline: 220, about: 2600 };

const INFLATED = /\b(expert|senior|world[- ]class|industry[- ]leading|revolutionary)\b/gi;
const SKIP_KEYS = new Set(['url', 'start', 'end']); // links and dates are not claims
const len = (s) => [...s.trim()].length;
const words = (s) => new Set((s.match(INFLATED) ?? []).map((w) => w.toLowerCase()));
const nums = (s) =>
  new Set((s.replace(/https?:\/\/\S+/g, '').match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/, '').replaceAll(',', '')));
const texts = (v) =>
  typeof v === 'string' ? [v]
  : v && typeof v === 'object' ? Object.entries(v).filter(([k]) => !SKIP_KEYS.has(k)).flatMap(([, x]) => texts(x))
  : [];
const canon = (u) => {
  if (typeof u !== 'string' || !u.trim()) throw new Error('URL is missing');
  const x = new URL(u);
  if (!/^https?:$/.test(x.protocol)) throw new Error('not http(s)');
  return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase();
};

export function validate(draft, source) {
  const problems = [];
  const counts = {};
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    return { ok: false, counts, problems: ['draft must be a JSON object'] };
  }
  const list = (name) => {
    const v = draft[name];
    if (v === undefined) return [];
    if (!Array.isArray(v)) { problems.push(`${name}: must be an array`); return []; }
    return v;
  };

  for (const [field, limit] of Object.entries(LIMITS)) {
    if (draft[field] === undefined) continue;
    if (typeof draft[field] !== 'string') { problems.push(`${field}: must be a string`); continue; }
    const chars = len(draft[field]);
    counts[field] = { chars, limit };
    if (chars === 0) problems.push(`${field}: empty`);
    else if (chars > limit) problems.push(`${field}: ${chars} characters, limit ${limit}`);
  }

  const dupes = (items, key, label) => {
    const seen = new Set();
    for (const item of items) {
      let k;
      try { k = key(item); } catch { problems.push(`${label}: invalid ${JSON.stringify(item)}`); continue; }
      if (seen.has(k)) problems.push(`${label}: duplicate ${JSON.stringify(item)}`);
      seen.add(k);
    }
  };
  dupes(list('skills'), (s) => {
    if (typeof s !== 'string') throw new Error('skill must be text');
    return s.trim().toLowerCase();
  }, 'skills');
  dupes(list('featured').map((f) => f?.url), canon, 'featured link');

  list('experience').forEach((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      problems.push(`experience[${i}]: must be an object`);
      return;
    }
    if (e?.current && e?.end) problems.push(`experience[${i}]: marked current but has an end date; ask the user which is right`);
  });

  const result = { ok: false, counts, problems };
  if (source === undefined) {
    result.note = 'no facts file: unsupported-number and inflated-word checks skipped';
  } else {
    const draftText = texts(draft).join('\n');
    const known = nums(source);
    for (const n of nums(draftText)) if (!known.has(n)) problems.push(`number "${n}" is not in the facts; get proof or remove it`);
    const allowed = words(source);
    for (const w of words(draftText)) if (!allowed.has(w)) problems.push(`"${w}" is not backed by the facts; remove it`);
  }
  result.ok = problems.length === 0;
  return result;
}

function main([input, sourcePath]) {
  if (!input) { console.error('usage: node validate.mjs <draft.json | -> [facts-file]'); return 2; }
  let draft, source;
  try {
    draft = JSON.parse(fs.readFileSync(input === '-' ? 0 : input, 'utf8'));
    if (sourcePath) source = fs.readFileSync(sourcePath, 'utf8');
  } catch (e) { console.error(`cannot read input: ${e.message}`); return 2; }
  const result = validate(draft, source);
  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
