'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../docs/js/landing-core.js');

const LABS = [
  { id: 'gem', title: 'Use Gemini CLI', summary: 'AI coding on the target camera', authors: 'Deep',
    href: 'gem/index.html', duration: 16, updated: null, published: '2026-10-30', featured: false,
    topics: ['AI & ML'], level: 'beginner', platforms: [] },
  { id: 'mp', title: 'MediaPipe Camera', summary: 'Face detection with AI', authors: 'Ann',
    href: 'mp/index.html', duration: 0, updated: null, published: '2026-09-28', featured: false,
    topics: ['AI & ML', 'Camera & Sensors'], level: 'intermediate', platforms: ['Raspberry Pi 5'] },
  { id: 'wsl', title: 'QSTI on WSL', summary: 'Run the image', authors: 'Bob',
    href: 'wsl/index.html', duration: 63, updated: null, published: '2026-04-06', featured: false,
    topics: ['Getting Started'], level: 'advanced', platforms: ['QEMU', 'Windows (WSL)'] },
  { id: 'lic', title: 'Get a License', summary: 'Free license', authors: 'Cy',
    href: 'lic/index.html', duration: 12, updated: null, published: null, featured: false,
    topics: ['Getting Started'], level: null, platforms: [] },
  { id: 'abc', title: 'Alpha Port', summary: 'Porting', authors: 'Di',
    href: 'abc/index.html', duration: 0, updated: null, published: '2026-04-06', featured: false,
    topics: ['Porting & Open Source'], level: 'beginner', platforms: ['QEMU'] },
];

const ids = (labs) => labs.map((l) => l.id);
const st = (o) => Object.assign(C.emptyState(), o);

test('slugify', () => {
  assert.equal(C.slugify('AI & ML'), 'ai-ml');
  assert.equal(C.slugify('Windows (WSL)'), 'windows-wsl');
  assert.equal(C.slugify('Camera & Sensors'), 'camera-sensors');
  assert.equal(C.slugify('llama.cpp'), 'llama-cpp');
});

test('buildFacets orders by count then label; levels in fixed order', () => {
  const f = C.buildFacets(LABS);
  assert.deepEqual(f.topics[0], { slug: 'ai-ml', label: 'AI & ML', total: 2 });
  assert.deepEqual(f.topics.map((t) => t.slug),
    ['ai-ml', 'getting-started', 'camera-sensors', 'porting-open-source']);
  assert.deepEqual(f.levels.map((l) => l.slug), ['beginner', 'intermediate', 'advanced']);
  assert.equal(f.levels[0].label, 'Beginner');
  assert.equal(f.levels[0].total, 2);
  assert.deepEqual(f.platforms[0], { slug: 'qemu', label: 'QEMU', total: 2 });
  for (const g of [f.topics, f.platforms, f.levels]) assert.ok(g.every((o) => o.slug !== ''));
});

test('buildFacets omits absent levels', () => {
  const f = C.buildFacets(LABS.filter((l) => l.level !== 'advanced'));
  assert.deepEqual(f.levels.map((l) => l.slug), ['beginner', 'intermediate']);
});

test('matches: topics and platforms are AND', () => {
  assert.deepEqual(ids(LABS.filter((l) => C.matches(l, st({ topics: ['ai-ml', 'camera-sensors'] })))), ['mp']);
  assert.deepEqual(ids(LABS.filter((l) => C.matches(l, st({ platforms: ['qemu', 'windows-wsl'] })))), ['wsl']);
  assert.deepEqual(ids(LABS.filter((l) => C.matches(l, st({ topics: ['ai-ml'], level: 'beginner' })))), ['gem']);
});

test('matches: search tokens are ANDed, case-insensitive, across fields', () => {
  assert.deepEqual(ids(LABS.filter((l) => C.matches(l, st({ q: 'camera  ai' })))), ['gem', 'mp']);
  assert.deepEqual(ids(LABS.filter((l) => C.matches(l, st({ q: 'CAMERA' })))), ['gem', 'mp']);
  assert.deepEqual(ids(LABS.filter((l) => C.matches(l, st({ q: 'raspberry' })))), ['mp']);
  assert.deepEqual(ids(LABS.filter((l) => C.matches(l, st({ q: 'deep' })))), ['gem']);
  assert.deepEqual(ids(LABS.filter((l) => C.matches(l, st({ q: 'zzz' })))), []);
});

test('facetCounts: adding to current selection; level replaces', () => {
  const c = C.facetCounts(LABS, st({ topics: ['ai-ml'] }));
  assert.equal(c.topics['ai-ml'], 2);
  assert.equal(c.topics['camera-sensors'], 1);
  assert.equal(c.topics['getting-started'], 0);
  assert.equal(c.platforms['raspberry-pi-5'], 1);
  assert.equal(c.levels.intermediate, 1);
  const c2 = C.facetCounts(LABS, st({ level: 'beginner' }));
  assert.equal(c2.levels.intermediate, 1);
  assert.equal(c2.levels.advanced, 1);
  assert.equal(c2.levels.beginner, 2);
});

test('sortLabs newest: null published last, ties by title', () => {
  assert.deepEqual(ids(C.sortLabs(LABS, 'newest')), ['gem', 'mp', 'abc', 'wsl', 'lic']);
});

test('sortLabs shortest: duration 0 last', () => {
  assert.deepEqual(C.sortLabs(LABS, 'shortest').map((l) => l.duration), [12, 16, 63, 0, 0]);
});

test('sortLabs az and does not mutate input', () => {
  const before = ids(LABS);
  assert.deepEqual(ids(C.sortLabs(LABS, 'az')), ['abc', 'lic', 'mp', 'wsl', 'gem']);
  assert.deepEqual(ids(LABS), before);
});

test('filterAndSort combines', () => {
  assert.deepEqual(ids(C.filterAndSort(LABS, st({ topics: ['getting-started'], sort: 'az' }))), ['lic', 'wsl']);
});

test('featuredLabs: newest first, max 3, empty when none', () => {
  assert.deepEqual(C.featuredLabs(LABS), []);
  const f = LABS.map((l) => Object.assign({}, l, { featured: l.id !== 'lic' }));
  assert.deepEqual(ids(C.featuredLabs(f)), ['gem', 'mp', 'abc']);
});

test('formatDate', () => {
  assert.equal(C.formatDate('2026-10-30'), 'Oct 30, 2026');
  assert.equal(C.formatDate('2026-01-05'), 'Jan 5, 2026');
  assert.equal(C.formatDate(''), '');
  assert.equal(C.formatDate(null), '');
});

test('isNew within 30 calendar days', () => {
  const lab = LABS[0];
  assert.equal(C.isNew(lab, new Date(2026, 10, 17)), true);
  assert.equal(C.isNew(lab, new Date(2026, 11, 5)), false);
  assert.equal(C.isNew(lab, new Date(2026, 10, 29)), true);
  assert.equal(C.isNew(LABS[3], new Date(2026, 10, 17)), false);
  assert.equal(C.isNew(lab, new Date(2026, 9, 1)), false, 'future publish is not "new" before it happens');
});

test('hash round trip', () => {
  const f = C.buildFacets(LABS);
  const s = { q: 'nv12 camera', topics: ['ai-ml', 'camera-sensors'], level: 'beginner',
    platforms: ['windows-wsl'], sort: 'az' };
  const h = C.serializeHash(s);
  assert.equal(h, 'q=nv12%20camera&topic=ai-ml,camera-sensors&level=beginner&platform=windows-wsl&sort=az');
  assert.deepEqual(C.parseHash('#' + h, f), s);
  assert.deepEqual(C.parseHash(h, f), s);
  assert.equal(C.serializeHash(C.emptyState()), '');
});

test('parseHash ignores unknown or invalid values', () => {
  const f = C.buildFacets(LABS);
  assert.deepEqual(C.parseHash('#topic=does-not-exist,ai-ml&level=expert&sort=bogus', f),
    st({ topics: ['ai-ml'] }));
  assert.deepEqual(C.parseHash('#garbage', f), C.emptyState());
  assert.deepEqual(C.parseHash('#topic=', f), C.emptyState());
  assert.deepEqual(C.parseHash('', f), C.emptyState());
  assert.deepEqual(C.parseHash('#q=%E0%A4%A', f), C.emptyState(), 'malformed escape does not throw');
});

test('parseHash drops a level that no codelab in the data has (stale link)', () => {
  const f = C.buildFacets(LABS.filter((l) => l.level !== 'advanced'));
  assert.deepEqual(C.parseHash('#topic=ai-ml&level=advanced', f), st({ topics: ['ai-ml'] }));
});

test('isStateHash: only key=value hashes carry filter state (skip link #results does not)', () => {
  assert.equal(C.isStateHash('#results'), false);
  assert.equal(C.isStateHash('#'), true, 'bare # means cleared state');
  assert.equal(C.isStateHash(''), true);
  assert.equal(C.isStateHash('#topic=ai-ml'), true);
  assert.equal(C.isStateHash('#sort=az&q=x'), true);
});
