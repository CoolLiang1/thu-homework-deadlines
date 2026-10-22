'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts');
fs.mkdirSync(output, { recursive: true });
let log = 'Validation run: ' + new Date().toISOString() + '\nNode: ' + process.version + '\n';
function report(text) { log += text; process.stdout.write(text); }
function save() { fs.writeFileSync(path.join(output, 'test-results.txt'), log, 'utf8'); }
const check = spawnSync(process.execPath, ['--check', 'thu-homework-deadlines.user.js'], { cwd: root, encoding: 'utf8' });
if (check.status !== 0) { report((check.stdout || '') + (check.stderr || '')); save(); process.exit(check.status || 1); }
report('Syntax check: PASS\n');
for (const timezone of ['UTC', 'Asia/Shanghai', 'America/New_York']) {
  report('\nTest timezone: ' + timezone + '\n');
  const result = spawnSync(process.execPath, ['--test', 'tests/deadlines.test.cjs', 'tests/pages.test.cjs'], {
    cwd: root, env: { ...process.env, TZ: timezone }, encoding: 'utf8'
  });
  report((result.stdout || '') + (result.stderr || ''));
  if (result.status !== 0) { save(); process.exit(result.status || 1); }
}
report('\nAll timezone runs passed. Synthetic tests only; no live website verification.\n');
save();
