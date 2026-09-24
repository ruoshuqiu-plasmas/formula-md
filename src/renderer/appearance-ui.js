let currentAppearance = null;
function refreshNativeUI() {
  const tab = activeTab();
  elements.insertImageButton.disabled = !tab;
  window.formulaMD.updateUIState({ hasDocument: Boolean(tab), title: tab ? `${tab.document.name} — Formula MD` : 'Formula MD',
    dirty: tab?.dirty, saving: tab?.saving, editing: tab?.isEditing, exporting: state.exportingPdf, searchCount: elements.searchCount.textContent });
}
function rgba(hex, alpha) {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${alpha})`;
}
function applyAppearance(appearance) {
  const previous = currentAppearance;
  currentAppearance = appearance;
  const { theme, platform, reducedTransparency, highContrast, active, nativeUI, palette, colors, settings } = appearance;
  Object.assign(document.documentElement.dataset, { theme, platform, palette, nativeUi: String(nativeUI),
    reducedTransparency: String(reducedTransparency), highContrast: String(highContrast), windowActive: String(active) });
  document.querySelector('#hljsLightTheme').disabled = theme === 'dark';
  document.querySelector('#hljsDarkTheme').disabled = theme !== 'dark';
  const alpha = reducedTransparency || highContrast ? 1 : settings.chromeOpacity;
  // This style element is screen-only; inline root styles would override print variables.
  elements.appearanceOverrides.textContent = `:root[data-theme][data-palette] { --accent: ${colors.accent}; --accent-bright: ${colors.accent};
    --accent-soft: ${rgba(colors.accent, 0.13)}; --syntax-selection: ${rgba(colors.accent, 0.2)};
    --chrome-base: ${colors.chrome}; --chrome-tint: ${rgba(colors.chrome, alpha)}; --glass-fill: ${rgba(colors.chrome, alpha)};
    --toolbar: ${rgba(colors.chrome, alpha)}; --bg: ${colors.page}; --editor-bg: ${colors.page};
    --text: ${colors.text}; --syntax-text: ${colors.text}; }`;
  elements.paletteSelect.value = palette;
  elements.settingsTheme.value = settings.theme;
  elements.settingsPalette.value = palette;
  elements.settingsOpacity.value = Math.round((1 - settings.chromeOpacity) * 100);
  elements.opacityValue.textContent = `${elements.settingsOpacity.value}%`;
  elements.settingsOpacity.disabled = reducedTransparency || highContrast;
  elements.settingsRemote.checked = settings.allowRemoteImages;
  for (const key of window.AppearanceSettings.colorKeys) {
    document.querySelector(`#color-${key}`).value = colors[key];
    const hex = document.querySelector(`#hex-${key}`);
    if (document.activeElement !== hex) hex.value = colors[key];
  }
  window.GlassEffects.refresh();
  refreshNativeUI();
  if (previous && previous.settings.allowRemoteImages !== settings.allowRemoteImages && activeTab()) {
    renderActiveTab({ fromEditor: true });
  }
}
async function updateSettings(patch) {
  try { await window.formulaMD.writeSettings(patch); }
  catch (error) { showToast(`设置保存失败：${error.message}`); }
}
function applyTheme(theme) { return updateSettings({ theme }); }
function applyPalette(palette) { return updateSettings({ palette }); }
async function initializeTheme() {
  window.formulaMD.onAppearanceChanged(applyAppearance);
  const stored = await window.formulaMD.readSettings();
  if (!stored.initialized) {
    const theme = localStorage.getItem('formula-md-theme');
    const palette = localStorage.getItem('formula-md-palette');
    if (window.AppearanceSettings.palettes[palette]) await window.formulaMD.writeSettings({ palette });
    if (['system', 'light', 'dark'].includes(theme)) await window.formulaMD.writeSettings({ theme });
  }
  applyAppearance(await window.formulaMD.getAppearance());
}
function setupSettings() {
  for (const [id, palette] of Object.entries(window.AppearanceSettings.palettes)) {
    const option = document.createElement('option'); option.value = id; option.textContent = palette.name;
    elements.settingsPalette.append(option);
  }
  const names = { accent: '强调色', chrome: '界面底色', page: '正文底色', text: '文字颜色' };
  for (const key of window.AppearanceSettings.colorKeys) {
    const row = document.createElement('label'); row.className = 'setting-row';
    const label = document.createElement('span'); label.textContent = names[key];
    const color = document.createElement('input'); color.type = 'color'; color.id = `color-${key}`; color.setAttribute('aria-label', names[key]);
    const hex = document.createElement('input'); hex.type = 'text'; hex.id = `hex-${key}`; hex.maxLength = 7; hex.pattern = '#[0-9a-fA-F]{6}'; hex.setAttribute('aria-label', `${names[key]}十六进制`);
    const save = (value) => updateSettings({ colors: { palette: currentAppearance.palette, [key]: value } });
    color.addEventListener('input', () => save(color.value));
    hex.addEventListener('input', () => { const valid = window.AppearanceSettings.validColor(hex.value); hex.setAttribute('aria-invalid', String(!valid)); if (valid) save(hex.value); });
    row.append(label, color, hex); elements.colorSettings.append(row);
  }
  elements.settingsButton.addEventListener('click', () => window.formulaMD.showSettings());
  elements.closeSettings.addEventListener('click', () => elements.settingsDialog.close());
  elements.settingsTheme.addEventListener('change', () => applyTheme(elements.settingsTheme.value));
  elements.settingsPalette.addEventListener('change', () => applyPalette(elements.settingsPalette.value));
  elements.settingsOpacity.addEventListener('input', () => { elements.opacityValue.textContent = `${elements.settingsOpacity.value}%`; updateSettings({ chromeOpacity: 1 - Number(elements.settingsOpacity.value) / 100 }); });
  elements.settingsRemote.addEventListener('change', () => updateSettings({ allowRemoteImages: elements.settingsRemote.checked }));
  elements.resetColors.addEventListener('click', () => updateSettings({ resetPalette: currentAppearance.palette }));
  window.formulaMD.onCommand(({ command, value }) => {
    const actions = { new: createFile, open: chooseFile, save: saveDocument, image: chooseImages, pdf: exportPdf,
      mode: () => setEditMode(Boolean(value)), settings: () => elements.settingsDialog.showModal(),
      search: () => { elements.searchInput.value = value; searchDocument(value); }, searchNext: () => moveSearch(Number(value) || 1) };
    actions[command]?.();
  });
}
