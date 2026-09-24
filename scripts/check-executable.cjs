// Launch the actual packaged executable in an isolated, hidden profile.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'formula-binary-'));
const output = path.resolve(__dirname, '../dist/qa-v2', `executable-${process.platform}`);
fs.mkdirSync(output, { recursive: true });
const executable = process.platform === 'darwin'
  ? path.resolve(__dirname, `../dist/mac-${process.arch}/Formula MD.app/Contents/MacOS/Formula MD`)
  : path.resolve(__dirname, '../dist/win-unpacked/Formula MD.exe');
const document = path.join(profile, 'binary-check.md');
fs.writeFileSync(path.join(profile, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="green"/></svg>');
fs.writeFileSync(document, '# 安装包检查\n\n$x^2$\n\n![图](image.svg)');
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let child, socket, exit, log = '';
(async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  child = spawn(executable, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {
    env: { ...process.env, FORMULA_MD_QA_PROFILE: profile, FORMULA_MD_QA_HIDDEN: '1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  exit = new Promise(resolve => child.once('exit', resolve));
  child.on('error', error => { log += error.stack; });
  child.stdout.on('data', bytes => { log += bytes; });
  child.stderr.on('data', bytes => { log += bytes; });
  let target;
  const start = Date.now();
  while (!target && Date.now() - start < 30000) {
    if (child.exitCode !== null) throw new Error(`Packaged executable exited: ${child.exitCode}\n${log}`);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page' && item.url.includes('index.html')); } catch {}
    if (!target) await pause(100);
  }
  if (!target) throw new Error(`Packaged app did not start\n${log}`);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, {once:true}); socket.addEventListener('error', reject, {once:true}); });
  const requests = new Map();
  let sequence = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (requests.has(message.id)) { requests.get(message.id)(message); requests.delete(message.id); }
  });
  async function evaluate(expression) {
    const id = ++sequence;
    let timer;
    try {
      const result = await Promise.race([
        new Promise(resolve => { requests.set(id, resolve); socket.send(JSON.stringify({id, method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}})); }),
        new Promise((_resolve,reject) => { timer = setTimeout(() => reject(new Error('Packaged evaluation timed out')), 20000); })
      ]);
      if (result.error || result.result.exceptionDetails) throw new Error(JSON.stringify(result));
      return result.result.result.value;
    } finally { clearTimeout(timer); requests.delete(id); }
  }
  while (!(await evaluate("typeof openDocument === 'function' && Boolean(window.formulaMD)"))) {
    if (Date.now() - start > 30000) throw new Error('Packaged renderer did not initialize');
    await pause(100);
  }
  const result = await evaluate(`(async () => {
    await window.MathJax.startup.promise;
    await openDocument(await window.formulaMD.openRecent(${JSON.stringify(document)}));
    await state.imagesReady;
    await window.formulaMD.writeSettings({palette:'ultra-violet'});
    const appearance = await window.formulaMD.getAppearance();
    return {nativeUI:appearance.nativeUI,nativeError:appearance.nativeError,palette:appearance.palette,
      imageWidth:elements.article.querySelector('img')?.naturalWidth,math:Boolean(elements.article.querySelector('mjx-container'))};
  })()`);
  assert.equal(result.imageWidth, 100); assert.equal(result.math, true); assert.equal(result.palette, 'ultra-violet');
  if (process.platform === 'darwin' && Number(os.release().split('.')[0]) >= 25) assert.equal(result.nativeUI, true, result.nativeError || 'Native bridge must load in the packaged binary');
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({passed:true,...result}, null, 2));
  console.log('Actual packaged executable passed:', result);
})().catch(error => {
  console.error(error); fs.writeFileSync(path.join(output, 'failure.txt'), `${error.stack}\n${log}`); process.exitCode = 1;
}).finally(async () => {
  socket?.close();
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await exit; }
  fs.rmSync(profile, { recursive:true, force:true, maxRetries:5, retryDelay:200 });
});
