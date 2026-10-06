// Real native/window/renderer checks, confined to a fresh disposable profile.
const { app, BrowserWindow, desktopCapturer, screen, systemPreferences } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (process.platform !== 'darwin' || process.env.FORMULA_MD_DISABLE_NATIVE === '1') app.exit(0);
const workspace = path.resolve(__dirname, '..');
const root = process.env.FORMULA_MD_APP_PATH || workspace;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'formula-glass-test-'));
process.env.FORMULA_MD_QA_PROFILE = profile;
const output = path.join(workspace, 'dist/glass-optimization');
fs.mkdirSync(output, { recursive: true });
const checks = [];
let mainWindow, backdrop;
let finished = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deadline = setTimeout(() => finish(new Error('Glass checks timed out')), 150000);
function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  fs.writeFileSync(path.join(output, 'native-checks.json'), JSON.stringify({ checks, screenCaptureAvailable: systemPreferences.getMediaAccessStatus('screen') === 'granted', error: error?.stack || null }, null, 2));
  console.log(JSON.stringify({ checks, error: error?.stack || null }, null, 2));
  backdrop?.destroy(); mainWindow?.destroy();
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  app.exit(error ? 1 : 0);
}
async function captureWindow(window, name) {
  if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') throw new Error('Whole-window transparency verification needs screen capture access');
  // A key window in a background Electron process still renders inactive glass.
  for (let attempt = 0; attempt < 5; attempt++) {
    window.moveTop(); window.focus(); app.focus({ steal: true }); await pause(300);
    if (window.isFocused()) break;
  }
  assert.equal(window.isFocused(), true, 'Desktop capture requires the test window to be focused');
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: display.size.width * display.scaleFactor, height: display.size.height * display.scaleFactor } });
  const source = sources.find((item) => item.display_id === String(display.id));
  assert.ok(source && !source.thumbnail.isEmpty());
  const scale = source.thumbnail.getSize().width / display.size.width;
  const crop = source.thumbnail.crop({ x: Math.round((bounds.x - display.bounds.x) * scale), y: Math.round((bounds.y - display.bounds.y) * scale), width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale) });
  fs.writeFileSync(path.join(output, `${name}.png`), crop.toPNG());
  return { image: crop, scale };
}
function pixel(capture, x, y) {
  return [...capture.image.crop({ x: Math.round(x * capture.scale), y: Math.round(y * capture.scale), width: 1, height: 1 }).toBitmap().subarray(0, 3)];
}
const difference = (left, right) => left.reduce((sum, value, i) => sum + Math.abs(value - right[i]), 0);
app.on('browser-window-created', (_event, window) => {
  if (mainWindow) return;
  mainWindow = window;
  const contents = window.webContents;
  // Synthetic activity must not inherit a CI desktop's background timer budget.
  // Real inactive/reduced-motion behavior is still checked through appearance state.
  contents.setBackgroundThrottling(false);
  const run = (code) => contents.executeJavaScript(code, true);
  const check = async (name, code) => {
    const value = await run(code);
    if (!value) console.log('Glass failure state', await run("({root:{...document.documentElement.dataset},motion:document.documentElement.classList.contains('glass-motion'),tracked:document.querySelector('.glass-tracking')?.className,duration:getComputedStyle(document.querySelector('.glass-surface')).transitionDuration})"));
    assert.equal(value, true, name); checks.push(name);
  };
  const wait = async (predicate) => {
    for (let i = 0; i < 240; i++) { if (await run(predicate)) return; await pause(50); }
    throw new Error(`Timed out: ${predicate}`);
  };
  contents.once('did-finish-load', async () => {
    try {
      const bridge = require(path.join(root, 'src/native/formula-md-native.node'));
      if (!bridge.isSupported()) { checks.push('Native glass unavailable on this macOS; compatibility is covered separately'); finish(); return; }
      await run('window.MathJax.startup.promise.then(() => true)');
      await wait('Boolean(currentAppearance)');
      const hostPreferences = await run(`({ appearance:currentAppearance,
        reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
        reducedTransparency:matchMedia('(prefers-reduced-transparency: reduce)').matches })`);
      const emulatePreferences = hostPreferences.reducedMotion || hostPreferences.reducedTransparency
        || hostPreferences.appearance.reducedMotion || hostPreferences.appearance.reducedTransparency || hostPreferences.appearance.highContrast;
      const normalMedia = emulatePreferences ? [
        { name:'prefers-reduced-motion', value:'no-preference' },
        { name:'prefers-reduced-transparency', value:'no-preference' },
        { name:'prefers-contrast', value:'no-preference' }
      ] : [];
      if (emulatePreferences) {
        await check('Host accessibility preferences disable renderer motion', "!document.documentElement.classList.contains('glass-motion')");
        assert.equal(JSON.parse(bridge.diagnostics()).glassGroups.every(group=>!group.interactive), true);
        console.log('Synthetic motion checks emulate ordinary preferences in this isolated window; host preferences remain unchanged', hostPreferences);
        contents.debugger.attach('1.3');
        await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features:normalMedia });
      }
      // Keep synthetic input reproducible while the user works in another app.
      await run(`window.glassQaEmulatePreferences = ${Boolean(emulatePreferences)};
        window.formulaMD.onAppearanceChanged(appearance=>applyAppearance({...appearance,active:true,
          ...(window.glassQaEmulatePreferences ? {reducedMotion:false,reducedTransparency:false,highContrast:false} : {})}));
        for(const type of ['pointermove','pointerleave','pointerdown','pointerup','blur']) window.addEventListener(type,event=>{if(event.isTrusted)event.stopImmediatePropagation();},true); true`);
      assert.equal(await run('currentAppearance.nativeUI'), true);
      assert.equal(JSON.parse(bridge.diagnostics()).windowBackdrop.attached, true);
      checks.push('Shared native diffusion and clear glass are attached');
      window.setSize(1260, 760); window.setPosition(60, 50); window.setAlwaysOnTop(true, 'floating'); window.show(); window.focus();
      await run("window.formulaMD.writeSettings({theme:'light',chromeOpacity:0})");
      const first = path.join(profile, '公式.md');
      const second = path.join(profile, '图片.md');
      fs.copyFileSync(path.join(workspace, 'examples/latex-showcase.md'), first);
      fs.writeFileSync(second, '# 图片\n\n第二个文档。');
      fs.writeFileSync(path.join(profile, 'recent-files.json'), JSON.stringify([{path:first,name:'公式.md'},{path:second,name:'图片.md'}]));
      await run('loadRecents()');
      for (const file of [first, second]) await run(`window.formulaMD.openRecent(${JSON.stringify(file)}).then(openDocument)`);
      await run(`switchTab(${JSON.stringify(first)})`);
      await wait("document.documentElement.classList.contains('glass-motion')");
      await pause(800);
      await check('Only known tabs and sidebar controls receive material surfaces', "Boolean(elements.tabList.querySelector('.glass-surface')) && Boolean(elements.recentList.querySelector('.glass-surface')) && Boolean(elements.outline.querySelector('.glass-surface'))");
      const pointer = async (selector, type, fraction = 0.5) => run(`(() => {
        const control = document.querySelector(${JSON.stringify(selector)}); const rect = control.getBoundingClientRect();
        control.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { bubbles:true, button:0, clientX:rect.x + rect.width * ${fraction}, clientY:rect.y + rect.height / 2 })); return true;
      })()`);
      for (const selector of ['.document-tab.active', '#outline .outline-item', '#recentList .recent-item', '#addTabButton']) {
        // Sample an actual finite trajectory. A window appearance notification can
        // correctly clear stationary tracking while the test host changes focus.
        const tracked = await run(`new Promise(resolve => {
          const control = document.querySelector(${JSON.stringify(selector)});
          let frames = 0;
          function move() {
            const rect = control.getBoundingClientRect();
            control.dispatchEvent(new PointerEvent('pointermove', { bubbles:true, clientX:rect.x + rect.width * (0.5 + frames / 40), clientY:rect.y + rect.height / 2 }));
            if (++frames < 12) requestAnimationFrame(move);
            else requestAnimationFrame(() => resolve(
              document.querySelector('.glass-tracking') === control
              && Boolean(control.querySelector('.glass-reflection'))
              && control.querySelector('.glass-surface').style.transform.includes('translate(')
              && Boolean(document.querySelector('.glass-flowing > .glass-ambient'))
            ));
          }
          move();
        })`);
        // Sample in the animation frame, before another IPC round trip can
        // legitimately clear stationary tracking on an appearance notification.
        assert.equal(tracked, true, `Visible material tracks ${selector}`);
        checks.push(`Visible material tracks ${selector}`);
      }
      await run("elements.article.insertAdjacentHTML('beforeend','<button class=\"glass-control\" id=\"documentGlassProbe\">文档内容</button>'); true");
      await pointer('#documentGlassProbe', 'pointermove');
      await check('Document HTML cannot register as interactive chrome', "!document.querySelector('#documentGlassProbe .glass-surface') && !document.querySelector('.glass-tracking')");
      await run("document.querySelector('#documentGlassProbe').remove(); true");
      const pressed = await run(`new Promise(resolve => requestAnimationFrame(() => {
        const control = document.querySelector('.document-tab.active');
        const rect = control.getBoundingClientRect();
        control.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,button:0,clientX:rect.x + rect.width / 2,clientY:rect.y + rect.height / 2}));
        requestAnimationFrame(() => resolve(control.classList.contains('glass-pressed')
          && Boolean(control.querySelector('.glass-surface').style.transform)
          && getComputedStyle(control).transform === 'none'));
      }))`);
      assert.equal(pressed, true, 'Press deforms material without moving the hit target');
      checks.push('Press deforms material without moving the hit target');
      await pointer('.document-tab.active', 'pointerup');
      await run("document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:800,clientY:400})); true");
      const settled = "!document.querySelector('.glass-tracking,.glass-reflection,.glass-caustic,.glass-ambient,.glass-flowing') && [...document.querySelectorAll('.glass-surface')].every(surface=>!surface.style.transform && surface.getAnimations().length === 0)";
      await wait(settled);
      await pause(100);
      await check('Material and ambient light settle without a continuing frame loop', settled);
      await run(`switchTab(${JSON.stringify(second)})`);
      await check('Changing tabs animates the shared selection lens', "document.querySelector('.glass-tab-lens').getAnimations().length === 1");
      await pause(700);
      await check('Selection lens stops after the switch', "document.querySelector('.glass-tab-lens').getAnimations().length === 0");
      for (let i = 0; i < 9; i++) {
        const file = path.join(profile, `标签-${i}.md`); fs.writeFileSync(file, `# 标签 ${i}`);
        await run(`window.formulaMD.openRecent(${JSON.stringify(file)}).then(openDocument)`);
      }
      await pause(700);
      await check('Overflow keeps the lens aligned with the selected tab', "(()=>{const lens=document.querySelector('.glass-tab-lens').getBoundingClientRect();const tab=elements.tabList.querySelector('.active').getBoundingClientRect();return Math.abs(lens.x-tab.x)<1 && Math.abs(lens.width-tab.width)<1 && elements.tabList.scrollWidth>elements.tabList.clientWidth;})()");
      await run('closeTab(state.activePath)'); await pause(700);
      await check('Closing the active tab repositions the lens', "(()=>{const lens=document.querySelector('.glass-tab-lens').getBoundingClientRect();const tab=elements.tabList.querySelector('.active').getBoundingClientRect();return Math.abs(lens.x-tab.x)<1;})()");
      await run(`switchTab(${JSON.stringify(first)})`);
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
      await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [...normalMedia.filter(feature=>feature.name !== 'prefers-reduced-motion'), {name:'prefers-reduced-motion',value:'reduce'}] });
      await wait("!document.documentElement.classList.contains('glass-motion')");
      await pointer('.document-tab.active', 'pointermove');
      await check('Reduced motion disables tracking and deformation', "!document.documentElement.classList.contains('glass-motion') && !document.querySelector('.glass-tracking') && getComputedStyle(document.querySelector('.glass-surface')).transitionDuration === '0s'");
      await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: normalMedia });
      await wait("document.documentElement.classList.contains('glass-motion')");
      const appearance = await run('currentAppearance');
      for (const flags of [{ reducedTransparency:true }, { highContrast:true }, { reducedMotion:true }, { active:false }]) {
        await run(`applyAppearance({...currentAppearance,${Object.entries(flags).map(([key,value])=>`${key}:${value}`).join(',')}}); true`);
        bridge.sync(JSON.stringify({appearance:{...appearance,...flags}}));
        assert.equal(JSON.parse(bridge.diagnostics()).glassGroups.every(group=>!group.interactive), true);
        if (flags.reducedTransparency || flags.highContrast) {
          assert.equal(JSON.parse(bridge.diagnostics()).windowBackdrop.hidden, true);
          assert.equal(JSON.parse(bridge.diagnostics()).windowBackdrop.opaque, true);
          await check('Accessibility restores an opaque document background', "getComputedStyle(elements.documentArea).backgroundColor === 'rgb(240, 245, 250)'");
        }
        await check(`Accessibility/activity override ${JSON.stringify(flags)} stops motion`, "!document.documentElement.classList.contains('glass-motion')");
        await run(`applyAppearance(${JSON.stringify(appearance)}); true`); bridge.sync(JSON.stringify({appearance}));
      }
      contents.debugger.detach();
      if (emulatePreferences) {
        await run('window.glassQaEmulatePreferences = false; window.formulaMD.getAppearance().then(applyAppearance)');
        if (process.env.FORMULA_MD_QA_REQUIRE_SCREEN === '1') throw new Error('Required desktop transparency capture cannot bypass host accessibility preferences');
        checks.push('Desktop transparency not verified on this host: accessibility preferences prevent ordinary glass');
        finish(); return;
      }
      if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
        if (process.env.FORMULA_MD_QA_REQUIRE_SCREEN === '1') throw new Error('Required desktop transparency capture is unavailable');
        checks.push('Desktop transparency and visual gallery not verified: screen capture unavailable on this host');
        finish(); return;
      }
      backdrop = new BrowserWindow({ ...window.getBounds(), frame:false, focusable:false, alwaysOnTop:true, show:false, webPreferences:{sandbox:true} });
      const backdropColor = async (value) => {
        await backdrop.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:${value};height:100vh"></body>`));
        backdrop.showInactive(); window.moveTop(); window.focus(); await pause(300);
      };
      const samples = [];
      for (const opacity of [1, 0.5, 0]) {
        await run(`window.formulaMD.writeSettings({chromeOpacity:${opacity}})`);
        await backdropColor('#c43662'); const red = await captureWindow(window, `opacity-${Math.round((1-opacity)*100)}-red`);
        await backdropColor('#245dba'); const blue = await captureWindow(window, `opacity-${Math.round((1-opacity)*100)}-blue`);
        samples.push({transparency:Math.round((1-opacity)*100), chromeDifference:difference(pixel(red,130,640),pixel(blue,130,640)), pageDifference:difference(pixel(red,1050,640),pixel(blue,1050,640))});
      }
      assert.ok(samples[0].chromeDifference < 6, JSON.stringify(samples));
      assert.ok(samples[2].chromeDifference > 80, JSON.stringify(samples));
      assert.ok(samples[1].chromeDifference > samples[0].chromeDifference && samples[1].chromeDifference < samples[2].chromeDifference, JSON.stringify(samples));
      assert.ok(samples[0].pageDifference < 6, JSON.stringify(samples));
      assert.ok(samples[2].pageDifference > 12 && samples[2].pageDifference < samples[2].chromeDifference, JSON.stringify(samples));
      assert.ok(samples[1].pageDifference < samples[2].pageDifference, JSON.stringify(samples));
      fs.writeFileSync(path.join(output, 'transparency-pixels.json'), JSON.stringify(samples, null, 2));
      checks.push('Desktop composition proves stronger chrome transparency and a gently translucent document');
      await backdropColor('linear-gradient(100deg,#c43662 0 24%,#245dba 24% 49%,#3ba35b 49% 74%,#daa728 74%)');
      for (const palette of await run('Object.keys(window.AppearanceSettings.palettes)')) {
        await run(`window.formulaMD.writeSettings({palette:${JSON.stringify(palette)}})`);
        await check(`Palette ${palette} preserves content opacity`, "getComputedStyle(elements.documentArea).opacity === '1' && getComputedStyle(elements.article).opacity === '1'");
        await captureWindow(window, `palette-${palette}`);
      }
      await run("window.formulaMD.writeSettings({palette:'arctic-frost'}); true");
      await run('setEditMode(true); true');
      await captureWindow(window, 'editor-glass');
      await check('Editor text remains opaque over one shared translucent page', "getComputedStyle(elements.sourceEditor).opacity === '1' && getComputedStyle(elements.editorPanel).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(elements.sourceEditor).opacity === '1'");
      await backdropColor('#c43662'); const editorRed = await captureWindow(window, 'editor-red');
      await backdropColor('#245dba'); const editorBlue = await captureWindow(window, 'editor-blue');
      assert.ok(difference(pixel(editorRed,600,640),pixel(editorBlue,600,640)) > 12);
      checks.push('Desktop composition proves the editor has the same gentle translucency');
      window.setSize(900,600); backdrop.setBounds(window.getBounds()); await pause(700);
      await check('Minimum window layout clears the native toolbar', 'elements.documentArea.getBoundingClientRect().top >= currentAppearance.nativeChromeInsetTop && elements.documentArea.getBoundingClientRect().right <= innerWidth && elements.documentArea.clientHeight > 200');
      await captureWindow(window, 'minimum-glass');
      window.setSize(1260,760); backdrop.setBounds(window.getBounds());
      await run('setEditMode(false); state.tabs.clear(); state.activePath=null; renderTabs(); showWelcome(); true');
      await captureWindow(window, 'welcome-glass');
      finish();
    } catch (error) { finish(error); }
  });
});
require(path.join(root, 'src/main.js'));
