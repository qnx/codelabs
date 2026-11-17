'use strict';
// Runs formatDate/isNew under a negative-UTC-offset timezone in a child process,
// because TZ must be set before the first Date is created.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const core = path.join(__dirname, '..', 'docs', 'js', 'landing-core.js');
const script = `
  const C = require(${JSON.stringify(core)});
  const lab = { published: '2026-10-30' };
  console.log(JSON.stringify([
    C.formatDate('2026-10-30'),
    C.isNew(lab, new Date(2026, 10, 29, 23, 30)),
    C.isNew(lab, new Date(2026, 10, 30, 0, 30)),
    C.formatDate('2026-11-17T17:04:29-05:00'),
  ]));`;

for (const tz of ['America/Toronto', 'Pacific/Honolulu', 'Asia/Tokyo', 'UTC']) {
  test(`dates are calendar days in ${tz}`, () => {
    const out = execFileSync(process.execPath, ['-e', script], { env: Object.assign({}, process.env, { TZ: tz }) });
    assert.deepEqual(JSON.parse(out), ['Oct 30, 2026', true, false, 'Nov 17, 2026']);
  });
}
