const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const packed = process.platform === 'darwin'
  ? path.join(root, `dist/mac-${process.arch}/Formula MD.app/Contents/Resources/app.asar`)
  : path.join(root, 'dist/win-unpacked/resources/app.asar');
if (!fs.existsSync(packed)) throw new Error(`Packaged app not found: ${packed}`);
const result = spawnSync(process.execPath, [path.join(root, 'scripts/run-appearance.cjs')], {
  stdio: 'inherit', env: { ...process.env, FORMULA_MD_APP_PATH: packed, FORMULA_MD_QA_LABEL: `packaged-${process.platform}` }
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const executableCheck = spawnSync(process.execPath, [path.join(root, 'scripts/check-executable.cjs')], { stdio: 'inherit' });
if (executableCheck.error) throw executableCheck.error;
process.exit(executableCheck.status ?? 1);
