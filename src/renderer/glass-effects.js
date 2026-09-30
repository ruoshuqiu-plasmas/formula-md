/* Event-driven glass: stable hit targets, one shared pair of lights, no idle loop. */
(() => {
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const controls = new Map();
  const modeControl = document.querySelector('#modeControl');
  const tabBar = document.querySelector('#tabBar');
  const tabList = document.querySelector('#tabList');
  const chromeContainers = ['#tabList', '#recentList', '#outline', '#welcomeRecents'];
  const lensClip = document.createElement('span');
  const lens = document.createElement('span');
  lensClip.className = 'glass-tab-lens-clip';
  lens.className = 'glass-tab-lens';
  lensClip.setAttribute('aria-hidden', 'true');
  lensClip.append(lens);
  tabBar.append(lensClip);
  let lensPosition = null;
  let lensAnimation = null;
  let tabFrame = null;
  const reflection = document.createElement('span');
  const caustic = document.createElement('span');
  reflection.className = 'glass-reflection';
  caustic.className = 'glass-caustic';
  reflection.setAttribute('aria-hidden', 'true');
  caustic.setAttribute('aria-hidden', 'true');

  // The rim and fill share this single deforming surface. Labels never scale.
  function prepare(control) {
    if (controls.has(control)) return;
    const surface = document.createElement('span');
    surface.className = 'glass-surface';
    surface.setAttribute('aria-hidden', 'true');
    control.prepend(surface);
    controls.set(control, surface);
  }
  document.querySelectorAll('.glass-control').forEach(prepare);
  function enhanced() { return root.dataset.platform === 'darwin' && root.dataset.nativeUi === 'true'; }
  function syncChrome(animateTabs = false) {
    for (const [control] of controls) {
      if (!control.isConnected) {
        if (target === control) reset(true);
        controls.delete(control);
      }
    }
    if (enhanced()) {
      for (const selector of chromeContainers) {
        document.querySelector(selector)?.querySelectorAll('.document-tab, .recent-item, .outline-item, .welcome-recent').forEach((control) => {
          control.classList.add('glass-control', 'glass-chrome-control');
          prepare(control);
        });
      }
      const addTab = document.querySelector('#addTabButton');
      if (addTab) { addTab.classList.add('glass-control', 'glass-chrome-control'); prepare(addTab); }
    }
    syncTabs(animateTabs);
  }
  function syncTabs(animate = false) {
    const activeTab = tabList.querySelector('.document-tab.active');
    lensClip.hidden = !enhanced() || tabBar.hidden || !activeTab;
    if (lensClip.hidden) { lensAnimation?.cancel(); lensPosition = null; return; }
    const barBounds = tabBar.getBoundingClientRect();
    const listBounds = tabList.getBoundingClientRect();
    const rect = activeTab.getBoundingClientRect();
    Object.assign(lensClip.style, { left: `${listBounds.left - barBounds.left}px`, top: `${listBounds.top - barBounds.top}px`, width: `${tabList.clientWidth}px`, height: `${listBounds.height}px` });
    const next = { x: rect.left - listBounds.left, y: rect.top - listBounds.top, width: rect.width, height: rect.height, path: activeTab.dataset.path };
    const old = lensPosition;
    if (old && old.path === next.path && ['x', 'y', 'width', 'height'].every((key) => Math.abs(old[key] - next[key]) < 0.25)) return;
    lensAnimation?.cancel();
    Object.assign(lens.style, { width: `${next.width}px`, height: `${next.height}px`, transform: `translate(${next.x}px, ${next.y}px)` });
    if (animate && old && old.path !== next.path && root.classList.contains('glass-motion')) {
      lensAnimation = lens.animate([
        { transform: `translate(${old.x}px, ${old.y}px) scale(${old.width / next.width}, ${old.height / next.height})` },
        { transform: `translate(${next.x + Math.sign(next.x - old.x) * 2}px, ${next.y}px) scale(1.025, 0.98)`, offset: 0.72 },
        { transform: `translate(${next.x}px, ${next.y}px) scale(1, 1)` }
      ], { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
    lensPosition = next;
  }
  function queueTabs() {
    if (tabFrame === null) tabFrame = requestAnimationFrame(() => { tabFrame = null; syncTabs(); });
  }

  let target = null;
  let bounds = null;
  let frame = null;
  let cleanupTimer = null;
  let pointerX = 0;
  let pointerY = 0;
  let pressed = false;
  let listening = false;
  let mode = null;

  function removeLights() {
    reflection.remove();
    caustic.remove();
  }

  function reset(immediate = false) {
    if (!target && frame === null) {
      if (immediate) {
        clearTimeout(cleanupTimer);
        removeLights();
      }
      return;
    }
    if (frame !== null) cancelAnimationFrame(frame);
    clearTimeout(cleanupTimer);
    frame = null;
    if (target) {
      target.classList.remove('glass-tracking', 'glass-pressed', 'glass-releasing');
      controls.get(target).style.removeProperty('transform');
    }
    target = null;
    bounds = null;
    pressed = false;
    if (immediate) removeLights();
    else cleanupTimer = setTimeout(removeLights, 260);
  }

  function queuePaint() {
    if (frame === null) frame = requestAnimationFrame(paint);
  }

  function paint() {
    frame = null;
    if (!target?.isConnected || target.matches(':disabled')) return reset(true);
    const x = Math.max(-1, Math.min(1, (pointerX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (pointerY - bounds.top) / bounds.height * 2 - 1));
    const surface = controls.get(target);
    // The relief stays anchored; a shallow squeeze keeps the glass fluid.
    const native = enhanced();
    const sx = pressed ? 1.025 : 1 + Math.abs(x) * (native ? 0.015 : 0.008);
    const sy = pressed ? (native ? 0.97 : 0.92) : 1 + Math.abs(y) * 0.016;
    surface.style.transform = `${native ? `translate(${(x * 1.5).toFixed(2)}px, ${(y * 1).toFixed(2)}px) ` : ''}scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    reflection.style.transform = `translate(${(x * bounds.width * 0.26).toFixed(2)}px, ${(y * 7).toFixed(2)}px) rotate(${(x * -14).toFixed(2)}deg) scale(${pressed ? '1.28, 0.82' : '1, 1'})`;
    caustic.style.transform = `translate(${(x * bounds.width * -0.18).toFixed(2)}px, ${(bounds.height * 0.4 - y * 4).toFixed(2)}px) scale(${pressed ? '0.86, 1.35' : '1, 1'})`;
  }

  function aim(element, x, y) {
    const next = element.closest('.glass-control');
    // Never allow document HTML to opt into UI effects.
    if (!controls.has(next) || next.matches(':disabled')) return reset();
    if (target !== next) {
      reset();
      clearTimeout(cleanupTimer);
      target = next;
      bounds = target.getBoundingClientRect();
      controls.get(target).append(reflection, caustic);
      target.classList.add('glass-tracking');
    }
    pointerX = x;
    pointerY = y;
    queuePaint();
  }

  function move(event) {
    if (!pressed) target?.classList.remove('glass-releasing');
    aim(event.target, event.clientX, event.clientY);
  }

  function press(event) {
    if (event.button !== 0) return;
    aim(event.target, event.clientX, event.clientY);
    if (!target) return;
    pressed = true;
    target.classList.remove('glass-releasing');
    target.classList.add('glass-pressed');
  }

  function release() {
    if (!target || !pressed) return;
    pressed = false;
    target.classList.remove('glass-pressed');
    target.classList.add('glass-releasing');
    queuePaint();
  }

  function keyDown(event) {
    if (event.repeat || ![' ', 'Enter'].includes(event.key)) return;
    const control = event.target.closest('.glass-control');
    if (!controls.has(control) || control.disabled) return;
    const rect = control.getBoundingClientRect();
    press({ target: control, button: 0, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 });
  }

  function keyUp(event) {
    if ([' ', 'Enter'].includes(event.key)) release();
  }

  function refresh() {
    reset(true);
    const enabled = !reducedMotion.matches && !reducedTransparency.matches
      && root.dataset.reducedMotion !== 'true'
      && root.dataset.reducedTransparency !== 'true' && root.dataset.highContrast !== 'true'
      && root.dataset.windowActive !== 'false' && !document.hidden;
    root.classList.toggle('glass-motion', enabled);
    if (!enabled) lensAnimation?.cancel();
    syncChrome();
    if (enabled === listening) return;
    listening = enabled;
    const method = enabled ? 'addEventListener' : 'removeEventListener';
    document[method]('pointermove', move, { passive: true });
    document[method]('pointerdown', press, { passive: true });
    document[method]('pointerup', release, { passive: true });
    document[method]('keydown', keyDown);
    document[method]('keyup', keyUp);
  }

  function setMode(editing) {
    const next = editing ? 'editor' : 'reader';
    if (mode !== null && mode !== next) {
      modeControl.dataset.liquidMode = next;
      reset();
    }
    mode = next;
  }

  [reducedMotion, reducedTransparency].forEach((query) => query.addEventListener('change', refresh));
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('pointerleave', () => reset());
  document.addEventListener('pointercancel', () => reset(true));
  document.addEventListener('focusout', (event) => {
    if (target?.contains(event.target) && !target.contains(event.relatedTarget)) reset();
  });
  document.addEventListener('scroll', (event) => { reset(); if (event.target === tabList) queueTabs(); }, { capture: true, passive: true });
  window.addEventListener('resize', () => { reset(true); queueTabs(); }, { passive: true });
  new ResizeObserver(queueTabs).observe(tabList);
  window.addEventListener('blur', () => { reset(true); lensAnimation?.cancel(); });
  window.GlassEffects = { refresh, setMode, syncChrome };
  refresh();
})();
