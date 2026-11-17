'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const docs = path.join(__dirname, '..', 'docs');
const read = (p) => fs.readFileSync(path.join(docs, p), 'utf8');
const FILES = ['index.html', 'js/landing.css', 'js/landing.js', 'js/landing-core.js'];

test('landing page loads no external resources', () => {
  for (const f of FILES) {
    const s = read(f);
    assert.doesNotMatch(s, /<(script|link|img|iframe)\b[^>]*\b(src|href)\s*=\s*["']?(https?:)?\/\//i, `${f}: external src/href`);
    assert.doesNotMatch(s, /url\(\s*["']?(https?:)?\/\//i, `${f}: external url()`);
    assert.doesNotMatch(s, /@import/i, `${f}: @import`);
    assert.doesNotMatch(s, /@font-face/i, `${f}: @font-face`);
    assert.doesNotMatch(s, /fonts\.googleapis|fonts\.gstatic|cdn\./i, `${f}: CDN reference`);
  }
});

test('landing page fonts are referenced by name only', () => {
  assert.match(read('js/landing.css'), /font-family:\s*Roboto,\s*Arial,\s*sans-serif/);
});

test('index.html loads data, core, then UI scripts locally', () => {
  const html = read('index.html');
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(srcs, ['codelabs-list.js', 'js/landing-core.js', 'js/landing.js']);
  assert.match(html, /<link rel="stylesheet" href="js\/landing\.css">/);
});

test('index.html links to the current community and docs pages', () => {
  const html = read('index.html');
  for (const url of [
    'https://qnx.software/en/developers/get-started/qnx-everywhere',
    'https://www.youtube.com/watch?v=iX4iWnKJRaA',
    'https://www.qnx.com/developers/docs/qnxeverywhere/index.html',
    'https://qnx.software/en/blog?type=qnx+everywhere',
    'https://www.reddit.com/r/QNX/?ref=codelabs',
    'https://discord.gg/Jj4EkkrFTT',
  ]) assert.ok(html.includes(`href="${url}"`), `missing link ${url}`);
  for (const old of ['DtWA5E-cFCo', 'href="https://devblog.qnx.com/"', 'discord.com/channels', 'ref=devblog.qnx.com']) {
    assert.ok(!html.includes(old), `old link still present: ${old}`);
  }
});

test('backup landing page is removed', () => {
  assert.equal(fs.existsSync(path.join(docs, 'index-bk.html')), false);
});
