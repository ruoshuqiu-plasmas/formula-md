// Exercise real AppKit event dispatch against an isolated Formula MD window.
const { app, BrowserWindow, screen } = require('electron');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const workspace = path.resolve(__dirname, '..');
const root = process.env.FORMULA_MD_APP_PATH || workspace;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'formula-titlebar-'));
process.env.FORMULA_MD_QA_PROFILE = profile;
const output = path.join(workspace, 'dist/qa-v2', process.env.FORMULA_MD_QA_LABEL || process.platform);
fs.mkdirSync(output, { recursive: true });
const checks = [];
const frames = [];
let window, otherWindow, finished = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => finish(new Error('Titlebar tests timed out')), 45000);
function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  const report = { checks, frames, error: error?.stack || null };
  fs.writeFileSync(path.join(output, 'titlebar-checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  otherWindow?.destroy(); window?.destroy();
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  app.exit(error ? 1 : 0);
}
app.on('browser-window-created', (_event, created) => {
  if (window) return;
  window = created;
  created.webContents.once('did-finish-load', async () => {
    try {
      const bridge = require(path.join(root, 'src/native/formula-md-native.node'));
      if (!bridge.isSupported() || process.env.FORMULA_MD_DISABLE_NATIVE === '1') {
        checks.push('Native titlebar unavailable; compatibility UI is covered by appearance tests');
        finish(); return;
      }
      const built = path.join(profile, 'window-events.node');
      const compilation = spawnSync('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-fmodules', '-DNAPI_VERSION=8',
        '-mmacosx-version-min=13.0', '-arch', process.arch, '-bundle', '-undefined', 'dynamic_lookup',
        '-framework', 'AppKit', '-I', require('node-api-headers').include_dir,
        path.join(__dirname, 'native-window-events.mm'), '-o', built], { encoding: 'utf8' });
      assert.equal(compilation.status, 0, compilation.stderr || compilation.error?.message);
      const input = require(built);
      await created.webContents.executeJavaScript('window.MathJax.startup.promise.then(() => true)');
      assert.equal(JSON.parse(bridge.diagnostics()).attached, true);
      created.setBounds({ x: 100, y: 100, width: 1000, height: 650 });
      created.show();
      await pause(300);
      const initial = created.getBounds();
      const workArea = screen.getDisplayMatching(initial).workArea;
      const geometry = () => JSON.parse(input.geometry(created.getNativeWindowHandle()));
      const chromePoint = (minimumX = 180) => {
        const layout = geometry();
        const y = layout.titlebarHeight / 2;
        for (let x = minimumX; x < created.getBounds().width - 30; x += 10) {
          if (!layout.controls.some(({ rect }) => x >= rect.x - 4 && x <= rect.x + rect.width + 4
              && y >= rect.y - 4 && y <= rect.y + rect.height + 4)) return { x, y };
        }
        throw new Error('No empty titlebar point found');
      };
      const click = async (point = chromePoint(), extra = {}, target = created) => {
        const passedBefore = geometry().passedEvents;
        // AppKit's double-click action runs on mouse-up. Avoid a synthetic
        // mouse-down drag loop, which can keep stale native tracking state.
        input.postClick(target.getNativeWindowHandle(), JSON.stringify({ ...point, count: 2,
          upOnly: true, routingProbe: Boolean(extra.upOnly), ...extra }));
        await pause(600);
        if (extra.upOnly) assert.equal(geometry().passedEvents - passedBefore, extra.count || 2,
          'Excluded clicks must pass through the app monitor');
      };
      const setAction = (action) => input.setAction(JSON.stringify({ action }));
      setAction('Maximize');
      await click(undefined, { count: 1 });
      assert.deepEqual(created.getBounds(), initial);
      checks.push('Single titlebar click preserves window bounds');
      await click();
      assert.equal(created.isMaximized(), true, 'Titlebar double-click must maximize');
      assert.deepEqual(created.getBounds(), workArea, 'Zoom fills the display work area');
      assert.equal(created.isFullScreen(), false);
      frames.push({ initial, maximized: created.getBounds() });
      checks.push('Titlebar double-click fills the work area without entering fullscreen');
      await click();
      assert.equal(created.isMaximized(), false);
      assert.deepEqual(created.getBounds(), initial);
      checks.push('Second titlebar double-click restores the original size and position');
      await click(chromePoint(300)); assert.deepEqual(created.getBounds(), workArea);
      await click(chromePoint(300)); assert.deepEqual(created.getBounds(), initial);
      checks.push('Empty titlebar space also supports maximize and restore');
      if (JSON.parse(setAction(null)).action === null) {
        await click(); assert.deepEqual(created.getBounds(), workArea);
        await click(); assert.deepEqual(created.getBounds(), initial);
        checks.push('Missing system preference defaults to maximize and restore');
      }
      setAction('Fill');
      await click(); assert.deepEqual(created.getBounds(), workArea);
      await click(); assert.deepEqual(created.getBounds(), initial);
      checks.push('Fill preference supports maximize and restore');
      for (const action of ['None', 'unrecognized']) {
        setAction(action); await click(); assert.deepEqual(created.getBounds(), initial);
      }
      checks.push('None and unknown preferences leave the window unchanged');
      setAction('Minimize');
      await click();
      assert.equal(created.isMinimized(), true);
      created.restore(); await pause(600);
      assert.deepEqual(created.getBounds(), initial);
      checks.push('Minimize preference sends the window to the Dock');
      setAction('Maximize');
      for (const { id, rect } of geometry().controls) {
        // Only mouse-up is needed to check routing; avoid opening file dialogs.
        await click({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, { upOnly: true });
        assert.deepEqual(created.getBounds(), initial, `Double-click on ${id} must remain with the control`);
        if (['files', 'document', 'settings'].includes(id)) {
          await click({ x: rect.x + 1, y: rect.y + rect.height / 2 }, { upOnly: true });
          assert.deepEqual(created.getBounds(), initial, `Glass padding for ${id} must remain with the control`);
        }
      }
      checks.push('Toolbar controls, glass padding and traffic lights are excluded');
      await click({ x: 500, y: 300 }, { upOnly: true });
      await click(undefined, { upOnly: true, control: true });
      assert.deepEqual(created.getBounds(), initial);
      checks.push('Document content and Control-click do not trigger window zoom');
      created.setResizable(false);
      await click(undefined, { upOnly: true });
      assert.deepEqual(created.getBounds(), initial);
      created.setResizable(true);
      checks.push('Non-resizable windows do not zoom');
      otherWindow = new BrowserWindow({ width: 300, height: 200, frame: false, show: false });
      await click({ x: 150, y: 20 }, { upOnly: true }, otherWindow);
      assert.deepEqual(created.getBounds(), initial);
      checks.push('Events from other windows cannot resize the reader');
      finish();
    } catch (error) { finish(error); }
  });
});
require(path.join(root, 'src/main.js'));
