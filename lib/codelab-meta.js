'use strict';
/**
 * Helpers for generate-codelabs.js: locate a codelab's source markdown and
 * turn its front matter + claat's codelab.json into a landing-page entry.
 * Node built-ins only.
 */
const fs = require('fs');
const path = require('path');

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const TEMPLATE_NAME = 'markdown-template.md';

/** Leading `key: value` lines, up to the first blank line or `#` heading. */
function parseFrontMatter(text) {
  const out = {};
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  let started = false;
  for (const line of lines) {
    if (!line.trim()) {
      if (started) break;
      continue;
    }
    if (line.startsWith('#')) break;
    const i = line.indexOf(':');
    if (i < 0) break;
    started = true;
    out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

function splitList(value) {
  const seen = new Set();
  const out = [];
  for (const part of String(value || '').split(',')) {
    const v = part.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch (e) { return false; }
}

/**
 * Find the source .md for a codelab regardless of which machine exported it:
 * 1) the `markdown/...` tail of `source` under rootDir, 2) scan by front-matter id.
 */
function locateSource(rootDir, source, id) {
  const norm = String(source || '').replace(/\\/g, '/');
  const idx = norm.lastIndexOf('markdown/');
  if (idx >= 0) {
    const candidate = path.join(rootDir, norm.slice(idx));
    if (isFile(candidate)) return candidate;
  }
  const mdRoot = path.join(rootDir, 'markdown');
  let dirs = [];
  try { dirs = fs.readdirSync(mdRoot, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch (e) { return null; }
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(path.join(mdRoot, d.name)); } catch (e) { continue; }
    for (const f of files) {
      if (!f.endsWith('.md') || f === TEMPLATE_NAME) continue;
      const p = path.join(mdRoot, d.name, f);
      const fm = parseFrontMatter(fs.readFileSync(p, 'utf8'));
      if (fm.id && fm.id === id) return p;
    }
  }
  return null;
}

function validYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return m[0];
}

function buildEntry(json, fm, dirName, hasIndex) {
  json = json || {};
  const id = json.id || dirName;
  const warnings = [];
  const warn = (msg) => warnings.push(`${id}: ${msg}`);

  const topics = fm ? splitList(fm.categories) : [];
  const platforms = fm ? splitList(fm.platforms) : [];
  const levelVals = fm ? splitList(fm.tags).map((s) => s.toLowerCase()) : [];
  const level = levelVals.length === 1 && LEVELS.includes(levelVals[0]) ? levelVals[0] : null;
  const published = fm ? validYmd(fm.published) : null;

  if (!fm) {
    warn('no front matter found; topics, level, platforms and published are empty');
  } else {
    if (!published) warn(`published is missing or not a real YYYY-MM-DD date (got "${fm.published || ''}")`);
    if (!level) warn(`tags must be exactly one level (${LEVELS.join(' | ')}), got "${fm.tags || ''}"`);
    if (topics.length < 1 || topics.length > 2) warn(`categories should list 1-2 topics, got ${topics.length}`);
  }

  return {
    entry: {
      id,
      title: json.title || dirName,
      summary: json.summary || '',
      authors: Array.isArray(json.authors) ? json.authors.join(', ') : (json.authors || ''),
      href: hasIndex ? `${dirName}/index.html` : '#',
      duration: Number(json.duration) > 0 ? Number(json.duration) : 0,
      updated: json.updated || null,
      published,
      featured: !!fm && String(fm.featured || '').trim().toLowerCase() === 'true',
      topics,
      level,
      platforms,
    },
    warnings,
  };
}

function isExcluded(fm) {
  return !!fm && /\b(draft|hidden)\b/i.test(String(fm.status || ''));
}

/** 'draft' or 'hidden' when the codelab is left off the landing page, else null. */
function skipReason(fm) {
  const m = fm && /\b(draft|hidden)\b/i.exec(String(fm.status || ''));
  return m ? m[1].toLowerCase() : null;
}

/**
 * Collection-level problems. `origins` is optional: [{ dir, source }] per entry folder,
 * used to catch a stale docs/<old-id>/ export left behind after an id change.
 */
function validateCollection(entries, origins) {
  const warnings = [];
  const n = entries.filter((e) => e.featured).length;
  if (n > 3) warnings.push(`${n} codelabs have featured: true; only the 3 newest are shown`);

  const seen = new Map();
  entries.forEach((e) => seen.set(e.id, (seen.get(e.id) || 0) + 1));
  seen.forEach((count, id) => {
    if (count > 1) warnings.push(`duplicate id "${id}" in ${count} docs/ folders; only one card will show`);
  });

  const bySource = new Map();
  (origins || []).forEach((o) => {
    if (!o.source) return;
    if (!bySource.has(o.source)) bySource.set(o.source, []);
    bySource.get(o.source).push(o.dir);
  });
  bySource.forEach((dirs, source) => {
    if (dirs.length > 1) {
      warnings.push(`docs/ folders ${dirs.join(', ')} come from the same source ${source}; delete the stale export`);
    }
  });
  return warnings;
}

module.exports = { parseFrontMatter, splitList, locateSource, buildEntry, isExcluded, skipReason, validateCollection, LEVELS };
