// Optional local benchmark. Set FORMULA_MD_BENCH_ROOT to compare another checkout.
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(process.env.FORMULA_MD_BENCH_ROOT || path.join(__dirname, '..'));
const label = (process.env.FORMULA_MD_BENCH_LABEL || 'glass').replace(/[^a-z0-9-]/gi, '-');
const output = path.resolve(__dirname, '../dist/glass-qa');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'formula-md-bench-'));
app.setPath('userData', profile);
fs.mkdirSync(output, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const result = { label, platform: process.platform, arch: process.arch, electron: process.versions.electron,
  inputMethod: 'DOM PointerEvent per animation frame; active appearance; desktop input isolated', phases: [] };
const deadline = setTimeout(() => app.exit(1), 90000);

app.on('browser-window-created', (_event, window) => {
  const contents = window.webContents;
  contents.once('did-finish-load', async () => {
    const run = (source) => contents.executeJavaScript(source, true);
    try {
      window.show();
      window.focus();
      window.setIgnoreMouseEvents(true);
      await run('window.MathJax.startup.promise.then(() => true)');
      // Measure active glass even if another desktop app receives focus meanwhile.
      await run("if (window.formulaMD.onAppearanceChanged) window.formulaMD.onAppearanceChanged((appearance) => applyAppearance({ ...appearance, active: true })); true");
      // Keep desktop pointer traffic from replacing the measured trajectory.
      await run("for (const type of ['pointermove', 'pointerleave', 'pointerdown', 'pointerup', 'blur']) window.addEventListener(type, (event) => { if (event.isTrusted) event.stopImmediatePropagation(); }, true); true");
      await run("applyTheme('light')");
      const sample = path.join(profile, 'benchmark.md');
      const content = fs.readFileSync(path.join(root, 'examples/latex-showcase.md'), 'utf8').repeat(20);
      fs.writeFileSync(sample, content);
      await run(`window.formulaMD.openRecent(${JSON.stringify(sample)}).then(openDocument)`);
      await run('setEditMode(false)');
      await pause(1500);
      result.documentBytes = Buffer.byteLength(content);
      result.formulas = await run("document.querySelectorAll('#article mjx-container').length");
      result.viewport = await run('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })');
      contents.debugger.attach('1.3');
      await contents.debugger.sendCommand('Performance.enable');
      const metrics = async () => Object.fromEntries((await contents.debugger.sendCommand('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
      async function measure(name, action) {
        const before = await metrics();
        app.getAppMetrics();
        const start = performance.now();
        const extra = await action();
        const durationMs = performance.now() - start;
        const processes = app.getAppMetrics().filter((item) => ['Tab', 'GPU'].includes(item.type));
        const after = await metrics();
        result.phases.push({ name, durationMs, ...extra,
          rendererTaskMs: (after.TaskDuration - before.TaskDuration) * 1000,
          layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
          layouts: after.LayoutCount - before.LayoutCount,
          styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
          jsHeapMB: after.JSHeapUsedSize / 1024 / 1024,
          processes: processes.map((item) => ({ type: item.type, cpuPercent: item.cpu.percentCPUUsage, workingSetMB: item.memory.workingSetSize / 1024 }))
        });
      }
      for (let round = 1; round <= 2; round += 1) {
        await measure(`idle-${round}`, () => pause(2000));
        await measure(`scroll-${round}`, () => run(`new Promise((resolve) => {
          const frames = [];
          let previous = performance.now();
          const start = previous;
          const maximum = elements.contentScroller.scrollHeight - elements.contentScroller.clientHeight;
          function tick(now) {
            frames.push(now - previous);
            previous = now;
            elements.contentScroller.scrollTop = maximum * (0.5 - 0.5 * Math.cos((now - start) / 3000 * Math.PI * 2));
            if (now - start < 3000) return requestAnimationFrame(tick);
            frames.shift();
            frames.sort((a, b) => a - b);
            resolve({ frames: frames.length, frameP50Ms: frames[Math.floor(frames.length * 0.5)], frameP95Ms: frames[Math.floor(frames.length * 0.95)], framesOver25Ms: frames.filter((ms) => ms > 25).length });
          }
          requestAnimationFrame(tick);
        })`));
        if (!(await run("document.documentElement.dataset.nativeUi === 'true'"))) {
        await measure(`pointer-${round}`, () => run(`new Promise((resolve) => {
          const button = elements.pdfButton;
          const bounds = button.getBoundingClientRect();
          let step = 0;
          function tick() {
            button.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1,
              clientX: bounds.x + bounds.width * (0.5 + Math.sin(step / 10) * 0.35),
              clientY: bounds.y + bounds.height * 0.5 }));
            step += 1;
            if (step < 120) return requestAnimationFrame(tick);
            requestAnimationFrame(() => resolve({ events: step, input: 'DOM PointerEvent per animation frame',
              activeControl: document.querySelector('.glass-tracking')?.id || null,
              hasGlass: Boolean(button.querySelector('.glass-surface')) }));
          }
          requestAnimationFrame(tick);
        })`));
        const measured = result.phases.at(-1);
        if (measured.hasGlass && measured.activeControl !== 'pdfButton') throw new Error('Pointer benchmark did not exercise the active glass surface');
        await run("document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 400, clientY: 400 })); true");
        await pause(700);
        }
      }
      result.visibleBackdropFilters = await run(`Array.from(document.querySelectorAll('*')).filter((element) => element.getBoundingClientRect().width && element.getBoundingClientRect().height && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).backdropFilter !== 'none').map((element) => element.className)`);
      fs.writeFileSync(path.join(output, `performance-${label}.json`), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      contents.debugger.detach();
      window.destroy();
      clearTimeout(deadline);
      fs.rmSync(profile, { recursive: true, force: true });
      app.exit(0);
    } catch (error) {
      console.error(error);
      window.destroy();
      clearTimeout(deadline);
      fs.rmSync(profile, { recursive: true, force: true });
      app.exit(1);
    }
  });
});

require(path.join(root, 'src/main.js'));
