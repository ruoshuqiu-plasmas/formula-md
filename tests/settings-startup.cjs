const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = process.env.FORMULA_MD_APP_PATH || path.resolve(__dirname, '..');
const output = path.resolve(__dirname, '../dist/qa-v2', process.env.FORMULA_MD_QA_LABEL || process.platform);
const profile = process.env.FORMULA_MD_QA_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'formula-restart-'));
if (!process.env.FORMULA_MD_QA_PROFILE) fs.copyFileSync(path.join(output, 'settings-saved.json'), path.join(profile, 'settings.json'));
app.setPath('userData', profile);
const deadline = setTimeout(() => app.exit(1), 30000);
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    let error;
    try {
      const appearance = await window.webContents.executeJavaScript('window.formulaMD.getAppearance()');
      assert.equal(appearance.palette, 'ultra-violet');
      assert.equal(appearance.colors.text, '#ffeecc');
      assert.equal(appearance.colors.accent, '#ff9955');
      assert.equal(appearance.settings.chromeOpacity, 1);
      assert.equal(appearance.settings.allowRemoteImages, false);
      console.log('Fresh application process restored the saved v2 settings.');
    } catch (caught) { error = caught; console.error(caught); }
    fs.writeFileSync(path.join(output, 'restart.json'), JSON.stringify({ passed: !error, error: error?.message || null }, null, 2));
    clearTimeout(deadline); window.destroy(); app.exit(error ? 1 : 0);
  });
});
require(path.join(root, 'src/main.js'));
