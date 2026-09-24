// Isolated end-to-end checks; never use or alter the user's profile/documents.
const { app, BrowserWindow, nativeTheme, dialog, clipboard, nativeImage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'formula-v2-'));
const root = process.env.FORMULA_MD_APP_PATH || path.resolve(__dirname, '..');
const output = path.resolve(__dirname, '../dist/qa-v2', process.env.FORMULA_MD_QA_LABEL || process.platform);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', profile);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ theme: 'light', palette: 'cloud-saas' }));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="160"><rect width="360" height="160" rx="16" fill="#146b5c"/><text x="25" y="90" font-size="28" fill="white">Formula MD 2.0</text></svg>';
const imagePath = path.join(profile, '图 #1.svg');
const documentPath = path.join(profile, '图片与公式.md');
const secondPath = path.join(profile, '第二份.md');
fs.writeFileSync(imagePath, svg);
fs.writeFileSync(secondPath, '# 第二份\n安全保留');
const checks = [];
let testWindow, server;
let requests = 0;
let finished = false;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeout = setTimeout(() => finish(new Error('UI tests timed out')), 150000);
function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks, error: error?.stack || null, platform: process.platform, electron: process.versions.electron }, null, 2));
  console.log(JSON.stringify({ checks, error: error?.stack || null, output }, null, 2));
  testWindow?.destroy(); server?.close();
  fs.rmSync(profile, { recursive: true, force: true });
  app.exit(error ? 1 : 0);
}
app.on('browser-window-created', (_event, window) => {
  if (testWindow) return;
  testWindow = window;
  const contents = window.webContents;
  contents.once('did-finish-load', async () => {
    const run = (script) => contents.executeJavaScript(script, true);
    const wait = async (predicate, limit = 12000) => {
      const start = Date.now();
      while (!(await run(predicate))) { if (Date.now() - start > limit) throw new Error(`Timed out: ${predicate}`); await pause(50); }
    };
    const check = async (name, script) => { const value = await run(script); if (!value) console.log(name, await run("({images:[...elements.article.querySelectorAll('img')].map(i=>({src:i.src,width:i.naturalWidth})),failures:[...elements.article.querySelectorAll('.image-placeholder')].map(i=>i.textContent)})")); assert.equal(value, true, name); checks.push(name); };
    const capture = async (name) => fs.writeFileSync(path.join(output, `${name}.png`), (await contents.capturePage()).toPNG());
    try {
      await run('window.MathJax.startup.promise.then(() => true)');
      await wait('Boolean(currentAppearance)');
      await check('Migrates existing palette without resetting it', "currentAppearance.palette === 'cloud-saas'");
      let bridge;
      if (process.platform === 'darwin') {
        bridge = require(path.join(root, 'src/native/formula-md-native.node'));
        const expectedNative = bridge.isSupported() && process.env.FORMULA_MD_DISABLE_NATIVE !== '1';
        assert.equal(await run('currentAppearance.nativeUI'), expectedNative, 'Native UI capability');
        if (expectedNative) {
          const native = JSON.parse(bridge.diagnostics());
          assert.equal(native.attached, true);
          assert.equal(native.controls.filter((item) => item.glass && item.class === 'NSButton').length, 6);
          checks.push('Actual NSToolbar and six AppKit glass buttons attached');
          bridge.perform(JSON.stringify({ id: 'settings' }));
          await pause(150);
          assert.equal(JSON.parse(bridge.diagnostics()).settingsClass, 'NSPanel');
          checks.push('Native settings command opens NSPanel');
        }
      }
      server = http.createServer((req, res) => { requests++; res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(svg); });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const remote = `http://127.0.0.1:${server.address().port}/image.svg`;
      const source = `# 图片与公式\n\n$x_1^2 + y_2^2 = z^2$\n\n![相对图片](<图%20%231.svg>)\n\n![引用图片][image]\n\n[image]: <图%20%231.svg>\n\n<img src="图%20%231.svg" alt="HTML 图片">\n\n![绝对路径](<${imagePath}>)\n\n![文件地址](<${pathToFileURL(imagePath).href}>)\n\n![内嵌图片](data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')})\n\n![网络图片](${remote})\n\n![缺失图片](missing.png)\n`;
      fs.writeFileSync(documentPath, source);
      await run(`window.formulaMD.openRecent(${JSON.stringify(documentPath)}).then(openDocument)`);
      await run('state.imagesReady.then(() => true)');
      await check('Relative, absolute, file URL, data, reference and HTML images decode', "[...elements.article.querySelectorAll('img')].length === 6 && [...elements.article.querySelectorAll('img')].every(img => img.complete && img.naturalWidth === 360)");
      await check('MathJax pipeline still renders protected formulas', "Boolean(elements.article.querySelector('mjx-container'))");
      await check('Disabled and missing images show descriptive placeholders', "elements.article.querySelectorAll('.image-placeholder').length === 2");
      assert.equal(requests, 0); checks.push('Remote images default to zero network requests');
      await capture('light-images');
      await run('window.formulaMD.writeSettings({ allowRemoteImages: true })');
      await wait("elements.article.querySelectorAll('img').length === 7");
      await run('state.imagesReady.then(() => true)');
      assert.equal(requests > 0, true); checks.push('Opt-in remote image renders');
      await run('window.formulaMD.writeSettings({ allowRemoteImages: false })');
      await wait("elements.article.querySelectorAll('.image-placeholder').length === 2");
      const afterDisable = requests;
      await run('renderActiveTab({ fromEditor: true }).then(() => state.imagesReady)');
      assert.equal(requests, afterDisable); checks.push('Disabling remote access prevents reload requests');
      await run('setEditMode(true); true');
      await pause(100);
      await run('elements.sourceEditor.focus(); elements.sourceEditor.setSelectionRange(elements.sourceEditor.value.length, elements.sourceEditor.value.length); true');
      const before = await run('elements.sourceEditor.value');
      await run(`insertImages((filePath) => window.formulaMD.importImages(filePath, [{name: '插入.svg', bytes: [...new TextEncoder().encode(${JSON.stringify(svg)})]}]))`);
      await check('Image import inserts a portable relative reference and marks dirty', "elements.sourceEditor.value.includes('.assets/') && activeTab().dirty");
      await run("document.execCommand('undo'); true");
      assert.equal(await run('elements.sourceEditor.value'), before); checks.push('Image insertion is one undo transaction');
      const originalOpenDialog = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [imagePath] });
      await run('chooseImages()');
      dialog.showOpenDialog = originalOpenDialog;
      await check('File picker imports the selected image', "elements.sourceEditor.value.includes('.assets/')");
      await run("document.execCommand('undo'); true");
      const png = [...nativeImage.createFromBitmap(Buffer.from([0, 120, 60, 255]), { width: 1, height: 1 }).toPNG()];
      await run(`(() => {
        const data = new DataTransfer();
        data.items.add(new File([new Uint8Array(${JSON.stringify(png)})], '粘贴.png', {type:'image/png'}));
        elements.sourceEditor.dispatchEvent(new ClipboardEvent('paste', {clipboardData:data, bubbles:true, cancelable:true}));
        return true;
      })()`);
      await wait("elements.sourceEditor.value.includes('%E7%B2%98%E8%B4%B4')");
      checks.push('Pasting image data creates a PNG and Markdown reference');
      await run("document.execCommand('undo'); true");
      contents.debugger.attach('1.3');
      const point = await run('({ x: elements.sourceEditor.getBoundingClientRect().x + 60, y: elements.sourceEditor.getBoundingClientRect().y + 60 })');
      for (const type of ['dragEnter', 'dragOver', 'drop']) {
        await contents.debugger.sendCommand('Input.dispatchDragEvent', { type, ...point, data: {items:[], files:[imagePath], dragOperationsMask:1} });
      }
      contents.debugger.detach();
      await wait("elements.sourceEditor.value.includes('.assets/')");
      checks.push('Dropping an actual file imports through the preload file-path bridge');
      await run("document.execCommand('undo'); true");
      // Test a pending import while input and active document change.
      await run(`globalThis.importTask = insertImages(async (filePath) => { await new Promise(resolve => setTimeout(resolve, 350)); return window.formulaMD.importImages(filePath, [{ name: '异步.svg', bytes: [...new TextEncoder().encode(${JSON.stringify(svg)})] }]); }); true`);
      await run("elements.sourceEditor.focus(); document.execCommand('insertText', false, '继续输入'); true");
      await run(`window.formulaMD.openRecent(${JSON.stringify(secondPath)}).then(openDocument)`);
      await run('globalThis.importTask.then(() => true)');
      await check('Pending import never modifies the newly activated tab', "!elements.sourceEditor.value.includes('.assets/') && elements.sourceEditor.value.includes('安全保留')");
      await run(`switchTab(${JSON.stringify(documentPath)})`);
      await check('Pending import preserves input in the originating document', "elements.sourceEditor.value.includes('继续输入') && elements.sourceEditor.value.includes('.assets/')");
      await run('saveDocument()');
      assert.match(fs.readFileSync(documentPath, 'utf8'), /\.assets\//); checks.push('Imported images save as ordinary Markdown');
      await run("window.formulaMD.writeSettings({palette:'ultra-violet'})");
      await wait("currentAppearance.palette === 'ultra-violet'");
      await run("window.formulaMD.writeSettings({colors:{palette:'ultra-violet',accent:'#ff9955',page:'#202030',chrome:'#302030',text:'#ffeecc'},chromeOpacity:0})");
      await wait("getComputedStyle(elements.article).color === 'rgb(255, 238, 204)'");
      await check('Transparent chrome keeps text, formula and content panel opaque', "getComputedStyle(elements.article).opacity === '1' && getComputedStyle(elements.documentArea).backgroundColor === 'rgb(32, 32, 48)'");
      await capture('dark-custom');
      await run("window.formulaMD.writeSettings({chromeOpacity:1})");
      await wait("currentAppearance.settings.chromeOpacity === 1");
      await check('Opaque chrome endpoint', "getComputedStyle(document.querySelector('.app-shell')).backgroundColor === 'rgb(48, 32, 48)'");
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
      assert.equal(saved.customColors['ultra-violet'].text, '#ffeecc'); checks.push('Settings persist atomically to disk');
      await contents.reload();
      await new Promise((resolve) => contents.once('did-finish-load', resolve));
      await wait("currentAppearance?.palette === 'ultra-violet' && Boolean(activeTab())");
      await check('Reload restores custom appearance and document session', "currentAppearance.colors.text === '#ffeecc'");
      await run('state.imagesReady.then(() => true)');
      const pdfPath = path.join(output, 'images.pdf');
      const originalDialog = dialog.showSaveDialog;
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: pdfPath });
      await run('exportPdf()');
      dialog.showSaveDialog = originalDialog;
      assert.equal(fs.existsSync(pdfPath), true);
      assert.equal(fs.readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF'); checks.push('PDF export completes with resolved images');
      contents.debugger.attach('1.3');
      await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
      await check('Print ignores custom screen colors', "getComputedStyle(elements.article).color !== 'rgb(255, 238, 204)'");
      await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen' });
      contents.debugger.detach();
      await run("applyAppearance({...currentAppearance, reducedTransparency:true, highContrast:true}); true");
      await check('Accessibility forces opaque chrome without replacing saved opacity', "elements.settingsOpacity.disabled && getComputedStyle(document.querySelector('.app-shell')).backgroundColor === 'rgb(48, 32, 48)'");
      window.setSize(900, 600);
      await pause(150);
      await check('Minimum-size layout contains the document', 'elements.documentArea.getBoundingClientRect().right <= innerWidth && elements.documentArea.clientHeight > 200');
      await capture('minimum-window');
      if (process.env.FORMULA_MD_QA_HOLD === '1') {
        window.show(); window.focus();
        console.log('QA window ready for visual inspection');
        clearTimeout(timeout);
        app.once('before-quit', () => finish());
        return;
      }
      finish();
    } catch (error) { await capture('failure').catch(() => {}); finish(error); }
  });
});
require(path.join(root, 'src/main.js'));
