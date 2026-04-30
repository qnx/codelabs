const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const codelabsDir = path.join(rootDir, 'docs');
const outputFile = path.join(codelabsDir, 'codelabs-list.js');

const codelabs = [];

fs.readdirSync(codelabsDir, { withFileTypes: true }).forEach(dir => {
  if (!dir.isDirectory()) return;

  const folderPath = path.join(codelabsDir, dir.name);
  const jsonPath = path.join(folderPath, 'codelab.json');
  const indexPath = path.join(folderPath, 'index.html');

  // Skip if neither codelab.json nor index.html exists
  if (!fs.existsSync(jsonPath) && !fs.existsSync(indexPath)) return;

  let data = {};
  if (fs.existsSync(jsonPath)) {
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (err) {
      console.warn(`⚠️ Failed to parse JSON in ${jsonPath}:`, err.message);
    }
  }

  codelabs.push({
    title: data.title || dir.name,
    //duration: data.duration ? `${data.duration} min` : 'N/A',
    href: fs.existsSync(indexPath) ? `${dir.name}/index.html` : '#',
    id: data.id || dir.name,
    authors: data.authors || [],
    summary: data.summary || "No summary.",
    updated: data.updated || null,
    category: data.category || 'Uncategorized',
    tags: data.tags || []
  });
});

// Write output
fs.writeFileSync(outputFile, `window.CODELABS = ${JSON.stringify(codelabs, null, 2)};`);
console.log(`✅ codelabs-list.js generated in docs/ (${codelabs.length} codelabs found)`);
