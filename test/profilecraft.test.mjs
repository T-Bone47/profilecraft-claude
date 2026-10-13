import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate } from '../plugins/profilecraft/skills/linkedin-profile-optimizer/validate.mjs';

const here = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(here), '..');
const rel = (...p) => path.join(root, ...p);
const read = (...p) => fs.readFileSync(rel(...p), 'utf8');
const json = (...p) => JSON.parse(read(...p));
const pluginDir = path.join('plugins', 'profilecraft');
const skillNames = fs.readdirSync(rel(pluginDir, 'skills'));
const validator = rel(pluginDir, 'skills', 'linkedin-profile-optimizer', 'validate.mjs');

function* files(dir = root) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.profilecraft'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else yield p;
  }
}

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'missing frontmatter');
  return Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
}

test('manifests parse and agree', () => {
  const market = json('.claude-plugin', 'marketplace.json');
  assert.ok(market.name && market.owner?.name && market.plugins?.length === 1);
  const entry = market.plugins[0];
  assert.match(entry.source, /^\.\//);
  const manifest = json(entry.source, '.claude-plugin', 'plugin.json');
  assert.equal(manifest.name, entry.name);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description);
  assert.equal(entry.version, undefined, 'set the version in plugin.json only');
});

test('four skills: portable frontmatter and identical shared rules', () => {
  assert.equal(skillNames.length, 4);
  const rules = (t) => t.slice(t.indexOf('\n## Rules'));
  let first;
  for (const name of skillNames) {
    const text = read(pluginDir, 'skills', name, 'SKILL.md');
    const fm = frontmatter(text);
    assert.equal(fm.name, name);
    assert.ok(fm.description.length > 40, `${name}: description too short`);
    assert.deepEqual(Object.keys(fm).sort(), ['description', 'name'], `${name}: keep to fields that also upload to Claude.ai`);
    assert.ok(text.includes('\n## Rules'), `${name}: rules missing`);
    first ??= rules(text);
    assert.equal(rules(text), first, `${name}: rules differ from the other skills`);
  }
});

test('README lists every skill and its relative links resolve', () => {
  const readme = read('README.md');
  for (const name of skillNames) assert.ok(readme.includes(`/profilecraft:${name}`), `README misses ${name}`);
  for (const [, link] of readme.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g)) {
    assert.ok(fs.existsSync(rel(link)), `broken link: ${link}`);
  }
});

test('headline limit: empty, whitespace, boundary, over, unicode', () => {
  assert.equal(validate({ headline: '' }).ok, false);
  assert.equal(validate({ headline: '   ' }).ok, false);
  assert.equal(validate({ headline: 'x'.repeat(220) }).ok, true);
  assert.equal(validate({ headline: `  ${'x'.repeat(220)}  ` }).ok, true);
  assert.equal(validate({ headline: 'x'.repeat(221) }).ok, false);
  assert.equal(validate({ headline: '😀'.repeat(220) }).counts.headline.chars, 220);
  assert.equal(validate({ headline: 'é'.repeat(221) }).ok, false);
});

test('about limit and wrong types', () => {
  assert.equal(validate({ about: 'x'.repeat(2600) }).ok, true);
  assert.equal(validate({ about: 'x'.repeat(2601) }).ok, false);
  assert.equal(validate({ about: 5 }).ok, false);
  assert.equal(validate([]).ok, false);
  assert.equal(validate({ skills: 'Python' }).ok, false);
});

test('duplicate skills and links and bad URLs are flagged once each', () => {
  const r = validate({
    skills: ['Python', ' python ', 'SQL'],
    featured: [{ url: 'https://github.com/a/b' }, { url: 'https://www.GitHub.com/a/b/' }, { url: 'not a url' }, { url: 'ftp://x.test/a' }],
  });
  assert.equal(r.problems.length, 4, r.problems.join(' | '));
});

test('unsupported numbers and inflated words need backing in the facts', () => {
  const facts = 'Built a parser in 2025. Team of 3. My title is Senior Engineer.';
  assert.equal(validate({ about: 'Built a parser in 2025 with a team of 3.' }, facts).ok, true);
  assert.equal(validate({ about: 'Cut latency by 40%.' }, facts).ok, false);
  assert.equal(validate({ about: 'Handled 1,200 users.' }, 'Handled 1200 users.').ok, true);
  assert.equal(validate({ about: 'Expert in parsers.' }, facts).ok, false);
  assert.equal(validate({ about: 'Senior parser engineer.' }, facts).ok, true);
  assert.equal(validate({ experience: [{ start: '2031-01', bullets: ['ok'] }] }, facts).ok, true, 'dates are not claims');
  assert.match(validate({ about: 'x' }).note, /skipped/);
});

test('contradictory current role is flagged for clarification', () => {
  const bad = validate({ experience: [{ title: 'Intern', current: true, end: '2026-12' }] });
  assert.equal(bad.ok, false);
  assert.match(bad.problems[0], /ask the user/);
  assert.equal(validate({ experience: [{ title: 'Intern', current: true }] }).ok, true);
});

test('CLI reads stdin and sets the exit code', () => {
  const run = (input) => spawnSync(process.execPath, [validator, '-'], { input, encoding: 'utf8' });
  assert.equal(run(JSON.stringify({ headline: 'fine' })).status, 0);
  const over = run(JSON.stringify({ headline: 'x'.repeat(221) }));
  assert.equal(over.status, 1);
  assert.equal(JSON.parse(over.stdout).ok, false);
  assert.equal(run('not json').status, 2);
  assert.equal(spawnSync(process.execPath, [validator], { encoding: 'utf8' }).status, 2);
});

test('shipped example draft passes against the shipped example facts', () => {
  const r = validate(json('examples', 'draft.example.json'), read('examples', 'profile-input.example.md'));
  assert.deepEqual(r.problems, []);
});

test('no private strings, profile URLs, emails or keys ship', () => {
  const denyPath = process.env.PROFILECRAFT_DENYLIST || rel('.profilecraft', 'denylist.txt');
  const deny = fs.existsSync(denyPath)
    ? fs.readFileSync(denyPath, 'utf8').split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean)
    : [];
  const patterns = [/linkedin\.com\/in\//i, /[\w.+-]+@[\w-]+\.[\w.-]+/, /sk-ant-[\w-]{10,}/, /ANTHROPIC_API_KEY\s*=\s*\S+/];
  for (const file of files()) {
    const text = fs.readFileSync(file, 'utf8');
    const name = path.relative(root, file);
    for (const re of patterns) assert.ok(!re.test(text), `${name} matches ${re}`);
    for (const word of deny) assert.ok(!text.toLowerCase().includes(word), `${name} contains a denylisted string`);
  }
});

test('.gitignore covers private inputs, secrets and exports', () => {
  const ignore = read('.gitignore').split('\n');
  for (const entry of ['.env', '.profilecraft/', 'profile-draft.*', 'proposed-changes.md', 'screenshots/']) {
    assert.ok(ignore.includes(entry), `.gitignore misses ${entry}`);
  }
});

test('manual-first: no dependencies and no browser-automation code', () => {
  const pkg = json('package.json');
  assert.deepEqual({ ...pkg.dependencies, ...pkg.devDependencies }, {});
  for (const f of files()) {
    if (!/\.(mjs|js|cjs)$/.test(f) || f === here) continue;
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /playwright|puppeteer|selenium|AutomationControlled/i, f);
  }
});
