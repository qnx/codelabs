'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../lib/codelab-meta.js');

test('parseFrontMatter: CRLF, trimming, stops at blank line, first colon only', () => {
  const fm = M.parseFrontMatter('id: x \r\ntitle: A: B\r\ncategories: AI & ML , Camera & Sensors\r\n\r\n# H\nlater: no');
  assert.deepEqual(fm, { id: 'x', title: 'A: B', categories: 'AI & ML , Camera & Sensors' });
});

test('parseFrontMatter: keeps URLs and stops at heading', () => {
  const fm = M.parseFrontMatter('feedback_link: https://github.com/x\nStatus: published\n# Title\nfoo: bar');
  assert.deepEqual(fm, { feedback_link: 'https://github.com/x', status: 'published' });
});

test('parseFrontMatter: skips leading blank lines, returns {} for no front matter', () => {
  assert.deepEqual(M.parseFrontMatter('\n\nid: y\n\n'), { id: 'y' });
  assert.deepEqual(M.parseFrontMatter('# Just a heading\n'), {});
});

test('splitList trims, drops empties, dedupes case-insensitively', () => {
  assert.deepEqual(M.splitList('AI & ML , ai & ml, , Camera & Sensors'), ['AI & ML', 'Camera & Sensors']);
  assert.deepEqual(M.splitList(undefined), []);
  assert.deepEqual(M.splitList(''), []);
});

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clab-'));
  fs.mkdirSync(path.join(root, 'markdown', 'llama.cpp'), { recursive: true });
  fs.writeFileSync(path.join(root, 'markdown', 'llama.cpp', 'llama.cpp.md'), 'id: running-llama-cpp-qnx\ntitle: L\n\n# L\n');
  fs.writeFileSync(path.join(root, 'markdown', 'markdown-template.md'), 'id: template-id\n\n# T\n');
  return root;
}

test('locateSource: foreign absolute path, relative path, id scan, not found', () => {
  const root = tmpRepo();
  const want = path.join(root, 'markdown', 'llama.cpp', 'llama.cpp.md');
  assert.equal(M.locateSource(root, '/Users/other/codelabs-qnx/markdown/llama.cpp/llama.cpp.md', 'x'), want);
  assert.equal(M.locateSource(root, './markdown/llama.cpp/llama.cpp.md', 'x'), want);
  assert.equal(M.locateSource(root, '/nope/elsewhere.md', 'running-llama-cpp-qnx'), want);
  assert.equal(M.locateSource(root, '/nope/elsewhere.md', 'unknown'), null);
  assert.equal(M.locateSource(root, '', 'unknown'), null);
});

test('locateSource ignores markdown-template.md in the id scan', () => {
  const root = tmpRepo();
  assert.equal(M.locateSource(root, '/nope.md', 'template-id'), null);
});

const JSON_IN = { id: 'gem', title: 'Gemini', summary: 'S', authors: 'Deep', duration: 16,
  updated: '2026-10-30T09:58:43-04:00', category: ['ai'], tags: ['beginner'] };
const FM = { id: 'gem', categories: 'AI & ML', tags: 'Beginner', platforms: 'QNX Developer Desktop',
  published: '2026-10-30', status: 'published' };

test('buildEntry: valid front matter gives exact shape and no warnings', () => {
  const { entry, warnings } = M.buildEntry(JSON_IN, FM, 'gemini-cli-qnx', true);
  assert.deepEqual(warnings, []);
  assert.deepEqual(entry, {
    id: 'gem', title: 'Gemini', summary: 'S', authors: 'Deep', href: 'gemini-cli-qnx/index.html',
    duration: 16, updated: '2026-10-30T09:58:43-04:00', published: '2026-10-30', featured: false,
    topics: ['AI & ML'], level: 'beginner', platforms: ['QNX Developer Desktop'],
  });
});

test('buildEntry: featured true, array authors, no index', () => {
  const { entry } = M.buildEntry(Object.assign({}, JSON_IN, { authors: ['A', 'B'] }),
    Object.assign({}, FM, { featured: 'True' }), 'gem', false);
  assert.equal(entry.featured, true);
  assert.equal(entry.authors, 'A, B');
  assert.equal(entry.href, '#');
});

test('buildEntry: invalid level, date and topic counts warn', () => {
  let r = M.buildEntry(JSON_IN, Object.assign({}, FM, { tags: 'qnx, rpi5' }), 'gem', true);
  assert.equal(r.entry.level, null);
  assert.ok(r.warnings.some((w) => /level/.test(w) && w.startsWith('gem')));
  r = M.buildEntry(JSON_IN, Object.assign({}, FM, { published: '2026-13-40' }), 'gem', true);
  assert.equal(r.entry.published, null);
  assert.ok(r.warnings.some((w) => /published/.test(w)));
  r = M.buildEntry(JSON_IN, Object.assign({}, FM, { published: '2026-02-30' }), 'gem', true);
  assert.equal(r.entry.published, null, 'Feb 30 is not a real date');
  r = M.buildEntry(JSON_IN, Object.assign({}, FM, { categories: 'A, B, C' }), 'gem', true);
  assert.ok(r.warnings.some((w) => /categor/.test(w)));
  r = M.buildEntry(JSON_IN, Object.assign({}, FM, { categories: '' }), 'gem', true);
  assert.ok(r.warnings.some((w) => /categor/.test(w)));
});

test('buildEntry: null front matter falls back with a warning', () => {
  const { entry, warnings } = M.buildEntry(JSON_IN, null, 'gem', true);
  assert.ok(warnings.length >= 1);
  assert.deepEqual([entry.topics, entry.platforms, entry.level, entry.published, entry.featured],
    [[], [], null, null, false]);
  assert.equal(entry.title, 'Gemini');
});

test('buildEntry: missing json fields default sanely', () => {
  const { entry } = M.buildEntry({}, FM, 'dir-name', true);
  assert.equal(entry.id, 'dir-name');
  assert.equal(entry.title, 'dir-name');
  assert.equal(entry.summary, '');
  assert.equal(entry.duration, 0);
  assert.equal(entry.updated, null);
});

test('isExcluded', () => {
  assert.equal(M.isExcluded({ status: 'draft' }), true);
  assert.equal(M.isExcluded({ status: 'Hidden' }), true);
  assert.equal(M.isExcluded({ status: 'published' }), false);
  assert.equal(M.isExcluded(null), false);
});

test('validateCollection warns over 3 featured', () => {
  let n = 0;
  const e = (f) => ({ id: 'lab' + (n++), featured: f });
  assert.equal(M.validateCollection([e(true), e(true), e(true), e(true)]).length, 1);
  assert.deepEqual(M.validateCollection([e(true), e(true), e(true), e(false)]), []);
});

test('skipReason names why a codelab is left off the page', () => {
  assert.equal(M.skipReason({ status: 'draft' }), 'draft');
  assert.equal(M.skipReason({ status: 'Hidden' }), 'hidden');
  assert.equal(M.skipReason({ status: 'published' }), null);
  assert.equal(M.skipReason(null), null);
});

test('validateCollection warns on duplicate ids and on two folders sharing one source', () => {
  const e = (id) => ({ id, featured: false });
  const w = M.validateCollection([e('a'), e('a'), e('b')],
    [{ dir: 'a', source: '/m/a.md' }, { dir: 'a-old', source: '/m/a.md' }, { dir: 'b', source: '/m/b.md' }]);
  assert.equal(w.filter((s) => /duplicate id "a"/.test(s)).length, 1, w.join('\n'));
  assert.equal(w.filter((s) => /a, a-old/.test(s) && /same source/.test(s)).length, 1, w.join('\n'));
  assert.deepEqual(M.validateCollection([e('a'), e('b')], [{ dir: 'a', source: '/m/a.md' }, { dir: 'b', source: null }]), []);
});
