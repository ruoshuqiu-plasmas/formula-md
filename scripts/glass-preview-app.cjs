// Developer preview and visual QA only. Never attaches to the installed app.
const { app, BrowserWindow, desktopCapturer, systemPreferences, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.env.FORMULA_MD_GLASS_ROOT || path.join(__dirname, '..'));
const profile = process.env.FORMULA_MD_QA_PROFILE;
const output = path.join(__dirname, '../dist/glass-optimization');
const qa = process.env.FORMULA_MD_GLASS_QA === '1';
const label = process.env.FORMULA_MD_GLASS_LABEL || 'after';
fs.mkdirSync(output, { recursive: true });
let previewWindow, backdrop;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
app.on('browser-window-created', (_event, window) => {
  if (previewWindow) return;
  previewWindow = window;
  const contents = window.webContents;
  const run = (code) => contents.executeJavaScript(code, true);
  contents.once('did-finish-load', async () => {
    try {
      await run('window.MathJax.startup.promise.then(() => true)');
      for (let i = 0; i < 200 && !(await run('Boolean(currentAppearance)')); i++) await pause(50);
      for (const file of ['latex-showcase.md', 'images-showcase.md']) {
        await run(`window.formulaMD.openRecent(${JSON.stringify(path.join(profile, 'examples', file))}).then(openDocument)`);
      }
      await run(`switchTab(${JSON.stringify(path.join(profile, 'examples/latex-showcase.md'))})`);
      await run('state.imagesReady.then(() => true)');
      window.show(); window.focus();
      if (!process.env.FORMULA_MD_GLASS_ROOT) {
        await pause(200);
        if (!window.getTitle().includes('玻璃预览')) throw new Error('预览窗口缺少独立预览标记');
      }
      if (qa) {
        const bounds = window.getBounds();
        backdrop = new BrowserWindow({ ...bounds, frame: false, focusable: false, show: false, webPreferences: { sandbox: true } });
        await backdrop.loadURL('data:text/html,' + encodeURIComponent('<body style="margin:0;background:linear-gradient(100deg,#c43662 0 24%,#245dba 24% 49%,#3ba35b 49% 74%,#daa728 74%);height:100vh"></body>'));
        backdrop.showInactive(); window.focus();
        const sceneFile = path.join(output, `scene-${label}.json`);
        let pending = Promise.resolve();
        const recordMotion = async (name) => {
          const directory = path.join(output, `${label}-${name}-frames`);
          fs.mkdirSync(directory, { recursive: true });
          const stamps = [];
          const paths = await run('[...state.tabs.keys()]');
          await run(`window.glassRecording = true;
            if (!window.glassRecordingListener) {
              window.glassRecordingListener = true;
              window.formulaMD.onAppearanceChanged(appearance => { if (window.glassRecording) applyAppearance({...appearance,active:true}); });
            }
            window.glassRecordingInput = event => { if (event.isTrusted) event.stopImmediatePropagation(); };
            for (const type of ['pointermove','pointerleave','pointerdown','pointerup','blur']) window.addEventListener(type,window.glassRecordingInput,true);
            applyAppearance({...currentAppearance,active:true}); true`);
          const inset = await run('currentAppearance.nativeChromeInsetTop || 0');
          const start = Date.now();
          try {
            for (let frame = 0; frame < 40; frame++) {
              if (frame === 23) await run(`switchTab(${JSON.stringify(paths[1])}); true`);
              const selector = frame < 8 ? '.document-tab.active' : frame < 16 ? '#outline .outline-item' : frame < 23 ? '#recentList .recent-item' : frame < 31 ? '.document-tab.active' : 'body';
              const type = frame === 6 ? 'pointerdown' : frame === 7 ? 'pointerup' : 'pointermove';
              await run(`(()=>{const control=document.querySelector(${JSON.stringify(selector)});if(!control)return true;const rect=control.getBoundingClientRect();control.dispatchEvent(new PointerEvent(${JSON.stringify(type)},{bubbles:true,button:0,clientX:rect.x+rect.width*${0.15 + (frame % 8) / 10},clientY:rect.y+rect.height/2}));return true;})()`);
              await pause(40);
              fs.writeFileSync(path.join(directory, `${String(frame).padStart(3, '0')}.png`), (await contents.capturePage({x:0,y:inset,width:800,height:520})).toPNG());
              stamps.push({frame,elapsedMs:Date.now()-start,selector,type,...await run("({tracked:document.querySelector('.glass-tracking')?.className || null,lensAnimations:document.querySelector('.glass-tab-lens')?.getAnimations().length || 0})")});
            }
            fs.writeFileSync(path.join(directory, 'frames.json'), JSON.stringify({ capture:'Renderer chrome only; native toolbar is shown in whole-window PNGs', stamps }, null, 2));
            await run(`switchTab(${JSON.stringify(paths[0])})`);
          } finally {
            await run(`window.glassRecording = false;
              for (const type of ['pointermove','pointerleave','pointerdown','pointerup','blur']) window.removeEventListener(type,window.glassRecordingInput,true);
              window.formulaMD.getAppearance().then(applyAppearance)`);
          }
        };
        const renderScene = async (scene) => {
          window.setAlwaysOnTop(true, 'floating'); backdrop.setAlwaysOnTop(true, 'floating');
          window.setIgnoreMouseEvents(true);
          backdrop.showInactive(); window.moveTop();
          try {
            if (scene.backdrop) await backdrop.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:${scene.backdrop};height:100vh"></body>`));
            if (scene.theme) await run(`window.formulaMD.writeSettings(${JSON.stringify({ theme: scene.theme, chromeOpacity: scene.opacity ?? 0, ...(scene.palette ? { palette: scene.palette } : {}) })})`);
            if (scene.size) { window.setSize(...scene.size); backdrop.setBounds(window.getBounds()); }
            if (scene.position) { window.setPosition(...scene.position); backdrop.setBounds(window.getBounds()); }
            await run(`setEditMode(${Boolean(scene.editing)}); true`);
            await run('elements.contentScroller.scrollTop = 0; true');
            window.focus(); app.focus({ steal: true });
            await pause(750);
            const diagnostics = process.platform === 'darwin' ? JSON.parse(require(path.join(root, 'src/native/formula-md-native.node')).diagnostics()) : null;
            fs.writeFileSync(path.join(output, `${label}-${scene.name}.json`), JSON.stringify({ diagnostics, appearance: await run('currentAppearance'), geometry: await run('({inset:currentAppearance.nativeChromeInsetTop,tab:elements.tabBar.getBoundingClientRect().toJSON(),page:elements.documentArea.getBoundingClientRect().toJSON()})') }, null, 2));
            fs.writeFileSync(path.join(output, `${label}-${scene.name}-content.png`), (await contents.capturePage()).toPNG());
            if (systemPreferences.getMediaAccessStatus('screen') === 'granted') {
              // Window-only capture substitutes neutral pixels for the desktop behind vibrancy.
              // Capture the display composition, then immediately retain only this test window.
              const bounds = window.getBounds();
              const display = screen.getDisplayMatching(bounds);
              const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: display.size.width * display.scaleFactor, height: display.size.height * display.scaleFactor } });
              const source = sources.find((item) => item.display_id === String(display.id));
              if (source && !source.thumbnail.isEmpty()) {
                const scale = source.thumbnail.getSize().width / display.size.width;
                const rect = { x: Math.max(0, Math.round((bounds.x - display.bounds.x) * scale)), y: Math.max(0, Math.round((bounds.y - display.bounds.y) * scale)), width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale) };
                fs.writeFileSync(path.join(output, `${label}-${scene.name}-window.png`), source.thumbnail.crop(rect).toPNG());
              }
            }
            if (scene.motion) await recordMotion(scene.name);
            console.log(`SCENE ${label}-${scene.name} ready`);
          } finally {
            window.setIgnoreMouseEvents(false);
            window.setAlwaysOnTop(false); backdrop.setAlwaysOnTop(false);
          }
        };
        fs.watch(output, (_type, filename) => {
          if (filename !== path.basename(sceneFile)) return;
          let scene; try { scene = JSON.parse(fs.readFileSync(sceneFile, 'utf8')); } catch { return; }
          pending = pending.then(() => renderScene(scene)).catch(console.error);
        });
        await renderScene({ name: 'light-100', theme: 'light', opacity: 0 });
      }
      console.log(`PREVIEW READY ${label}; profile=${profile}`);
    } catch (error) { console.error(error); app.exit(1); }
  });
  window.on('closed', () => { backdrop?.destroy(); app.quit(); });
});
require(path.join(root, 'src/main.js'));
