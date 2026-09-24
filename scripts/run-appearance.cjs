const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'formula-md-qa-'));
let exitCode = 0;
try {
  const scripts = process.env.FORMULA_MD_QA_HOLD === '1' ? ['appearance-v2.cjs'] : ['appearance-v2.cjs', 'settings-startup.cjs'];
  for (const script of scripts) {
    const result = spawnSync(require('electron'), [path.resolve(__dirname, '../tests', script)], {
      stdio: 'inherit', env: { ...process.env, FORMULA_MD_QA_PROFILE: profile }
    });
    if (result.error) throw result.error;
    if (result.status !== 0) { exitCode = result.status || 1; break; }
  }
} finally {
  // Chromium may flush files until the process exits. Clean up from the parent.
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(exitCode);
