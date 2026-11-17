// Builds docs/codelabs-list.js for the landing page.
// Run after any `claat export`, or after editing a codelab's front matter
// (e.g. featured: true):   node generate-codelabs.js
const fs = require('fs');
const path = require('path');
const meta = require('./lib/codelab-meta');
const { sortLabs } = require('./docs/js/landing-core');

const rootDir = __dirname;
const codelabsDir = path.join(rootDir, 'docs');
const outputFile = path.join(codelabsDir, 'codelabs-list.js');

const entries = [];
const origins = [];
const warnings = [];
const skipped = [];

fs.readdirSync(codelabsDir, { withFileTypes: true }).forEach((dir) => {
  if (!dir.isDirectory()) return;

  const folderPath = path.join(codelabsDir, dir.name);
  const jsonPath = path.join(folderPath, 'codelab.json');
  const indexPath = path.join(folderPath, 'index.html');

  // Skip folders that aren't codelabs (e.g. docs/js)
  if (!fs.existsSync(jsonPath) && !fs.existsSync(indexPath)) return;

  let json = {};
  if (fs.existsSync(jsonPath)) {
    try {
      json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (err) {
      warnings.push(`${dir.name}: failed to parse codelab.json (${err.message})`);
    }
  }

  const id = json.id || dir.name;
  const src = meta.locateSource(rootDir, json.source, id);
  let fm = null;
  if (src) {
    fm = meta.parseFrontMatter(fs.readFileSync(src, 'utf8'));
  } else {
    warnings.push(`${id}: SOURCE MARKDOWN NOT FOUND (${json.source || 'no source in codelab.json'})`);
  }
  const reason = meta.skipReason(fm);
  if (reason) {
    skipped.push(`${id} (status: ${reason})`);
    return;
  }

  const { entry, warnings: w } = meta.buildEntry(json, fm, dir.name, fs.existsSync(indexPath));
  entries.push(entry);
  origins.push({ dir: dir.name, source: src });
  warnings.push(...w);
});

warnings.push(...meta.validateCollection(entries, origins));
const sorted = sortLabs(entries, 'newest');

fs.writeFileSync(outputFile, `window.CODELABS = ${JSON.stringify(sorted, null, 2)};\n`);
warnings.forEach((w) => console.warn(`⚠️  ${w}`));
skipped.forEach((s) => console.log(`ℹ️  not listed on the landing page: ${s}`));
console.log(`✅ codelabs-list.js generated in docs/ (${sorted.length} codelabs, ${skipped.length} skipped, ${warnings.length} warnings)`);
