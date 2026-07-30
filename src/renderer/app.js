const SESSION_KEY = 'formula-md-tab-session-v1';

const state = {
  tabs: new Map(),
  activePath: null,
  mathCount: 0,
  searchMarks: [],
  currentMark: -1,
  renderId: 0,
  editModePreference: localStorage.getItem('formula-md-mode') === 'editor',
  exportingPdf: false,
  previewTimer: null,
  persistTimer: null,
  highlightFrame: null,
  scrollSyncFrame: null,
  scrollSyncSource: null,
  restoringPositions: false
};

const elements = {
  addTabButton: document.querySelector('#addTabButton'),
  article: document.querySelector('#article'),
  contentScroller: document.querySelector('#contentScroller'),
  documentArea: document.querySelector('#documentArea'),
  documentTitle: document.querySelector('#documentTitle'),
  dropOverlay: document.querySelector('#dropOverlay'),
  engineStatus: document.querySelector('#engineStatus'),
  editorPanel: document.querySelector('#editorPanel'),
  editorPosition: document.querySelector('#editorPosition'),
  editModeButton: document.querySelector('#editModeButton'),
  editStatus: document.querySelector('#editStatus'),
  editStatusSeparator: document.querySelector('#editStatusSeparator'),
  formulaCount: document.querySelector('#formulaCount'),
  lineNumbers: document.querySelector('#lineNumbers'),
  modeControl: document.querySelector('#modeControl'),
  newButton: document.querySelector('#newButton'),
  openButton: document.querySelector('#openButton'),
  outline: document.querySelector('#outline'),
  outlineSection: document.querySelector('#outlineSection'),
  pdfButton: document.querySelector('#pdfButton'),
  recentList: document.querySelector('#recentList'),
  recentSection: document.querySelector('#recentSection'),
  readModeButton: document.querySelector('#readModeButton'),
  renderStatus: document.querySelector('#renderStatus'),
  revealButton: document.querySelector('#revealButton'),
  saveButton: document.querySelector('#saveButton'),
  saveButtonText: document.querySelector('#saveButtonText'),
  searchControl: document.querySelector('#searchControl'),
  searchCount: document.querySelector('#searchCount'),
  searchInput: document.querySelector('#searchInput'),
  sourceEditor: document.querySelector('#sourceEditor'),
  sourceEditorStage: document.querySelector('#sourceEditorStage'),
  sourceHighlight: document.querySelector('#sourceHighlight'),
  statusBar: document.querySelector('#statusBar'),
  tabBar: document.querySelector('#tabBar'),
  tabList: document.querySelector('#tabList'),
  themeButton: document.querySelector('#themeButton'),
  welcome: document.querySelector('#welcome'),
  welcomeNewButton: document.querySelector('#welcomeNewButton'),
  welcomeOpenButton: document.querySelector('#welcomeOpenButton'),
  welcomeRecents: document.querySelector('#welcomeRecents'),
  wordCount: document.querySelector('#wordCount')
};

const markdown = window.markdownit({
  html: true,
  linkify: true,
  breaks: false,
  typographer: true,
  highlight(code, language) {
    if (language && window.hljs.getLanguage(language)) {
      return `<pre class="hljs"><code>${window.hljs.highlight(code, { language, ignoreIllegals: true }).value}</code></pre>`;
    }
    return `<pre class="hljs"><code>${window.MathProtector.escapeHtml(code)}</code></pre>`;
  }
});

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const targetIndex = token.attrIndex('target');
  if (targetIndex < 0) token.attrPush(['target', '_blank']);
  else token.attrs[targetIndex][1] = '_blank';
  token.attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, index, options);
};

function activeTab() {
  return state.activePath ? state.tabs.get(state.activePath) || null : null;
}

function emptyPosition() {
  return { top: 0, ratio: 0 };
}

function normalizePosition(value) {
  return {
    top: Number.isFinite(value?.top) ? Math.max(0, value.top) : 0,
    ratio: Number.isFinite(value?.ratio) ? Math.max(0, Math.min(1, value.ratio)) : 0
  };
}

function positionFor(element) {
  const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
  return {
    top: Math.max(0, element.scrollTop),
    ratio: maximum > 0 ? Math.max(0, Math.min(1, element.scrollTop / maximum)) : 0
  };
}

function restorePosition(element, position) {
  const normalized = normalizePosition(position);
  const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
  const top = normalized.top <= maximum ? normalized.top : normalized.ratio * maximum;
  element.scrollTop = Math.max(0, Math.min(maximum, top));
}

function sessionSnapshot() {
  const positions = {};
  for (const [filePath, tab] of state.tabs) {
    positions[filePath] = {
      preview: tab.previewPosition,
      editor: tab.editorPosition,
      selectionStart: tab.selectionStart,
      selectionEnd: tab.selectionEnd,
      isEditing: tab.isEditing
    };
  }
  return {
    version: 1,
    paths: [...state.tabs.keys()],
    activePath: state.activePath,
    positions
  };
}

function persistSession() {
  clearTimeout(state.persistTimer);
  state.persistTimer = null;
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionSnapshot()));
}

function schedulePersistSession() {
  clearTimeout(state.persistTimer);
  state.persistTimer = setTimeout(persistSession, 160);
}

function readStoredSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!stored || !Array.isArray(stored.paths)) return null;
    return stored;
  } catch {
    return null;
  }
}

function createTab(documentData, restored = {}) {
  return {
    document: documentData,
    lastSavedContent: documentData.content,
    dirty: false,
    saving: false,
    isEditing: typeof restored.isEditing === 'boolean' ? restored.isEditing : state.editModePreference,
    previewPosition: normalizePosition(restored.preview),
    editorPosition: normalizePosition(restored.editor),
    selectionStart: Number.isInteger(restored.selectionStart) ? restored.selectionStart : 0,
    selectionEnd: Number.isInteger(restored.selectionEnd) ? restored.selectionEnd : 0
  };
}

function syncActiveTabFromView() {
  const tab = activeTab();
  if (!tab) return;
  tab.document = { ...tab.document, content: elements.sourceEditor.value };
  tab.previewPosition = positionFor(elements.contentScroller);
  tab.editorPosition = positionFor(elements.sourceEditor);
  tab.selectionStart = elements.sourceEditor.selectionStart;
  tab.selectionEnd = elements.sourceEditor.selectionEnd;
  schedulePersistSession();
}

function anyDirtyTabs() {
  return [...state.tabs.values()].some((tab) => tab.dirty);
}

function updateWindowTitle() {
  const tab = activeTab();
  if (!tab) {
    document.title = 'Formula MD';
    return;
  }
  document.title = `${tab.dirty ? '● ' : ''}${tab.document.name} — Formula MD`;
}

function refreshDirtyUI() {
  const tab = activeTab();
  const dirty = Boolean(tab?.dirty);
  elements.saveButton.disabled = !dirty || Boolean(tab?.saving);
  elements.saveButtonText.textContent = tab?.saving ? '保存中…' : '保存';
  elements.editStatus.textContent = dirty ? '未保存' : '已保存';
  elements.editStatus.classList.toggle('unsaved', dirty);
  elements.editStatus.classList.toggle('saved', !dirty);
  elements.documentTitle.classList.toggle('dirty', dirty);
  window.formulaMD.setDocumentEdited(anyDirtyTabs());
  updateWindowTitle();
  renderTabs();
}

function setDirty(dirty) {
  const tab = activeTab();
  if (!tab) return;
  tab.dirty = Boolean(dirty);
  refreshDirtyUI();
}

function renderTabs() {
  elements.tabList.replaceChildren();
  elements.tabBar.hidden = state.tabs.size === 0;

  for (const [filePath, tab] of state.tabs) {
    const item = document.createElement('div');
    item.className = 'document-tab';
    item.classList.toggle('active', filePath === state.activePath);
    item.classList.toggle('dirty', tab.dirty);
    item.dataset.path = filePath;
    item.title = filePath;

    const activateButton = document.createElement('button');
    activateButton.type = 'button';
    activateButton.className = 'tab-activate';
    activateButton.setAttribute('role', 'tab');
    activateButton.setAttribute('aria-selected', String(filePath === state.activePath));
    activateButton.innerHTML = '<span class="tab-file-icon">MD</span><span class="tab-title"></span><span class="tab-dirty" aria-label="未保存"></span>';
    activateButton.querySelector('.tab-title').textContent = tab.document.name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '');
    activateButton.addEventListener('click', () => switchTab(filePath));

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'tab-close';
    closeButton.title = `关闭 ${tab.document.name}`;
    closeButton.setAttribute('aria-label', `关闭 ${tab.document.name}`);
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>';
    closeButton.addEventListener('click', () => closeTab(filePath));

    item.addEventListener('auxclick', (event) => {
      if (event.button === 1) closeTab(filePath);
    });
    item.append(activateButton, closeButton);
    elements.tabList.append(item);
  }

  requestAnimationFrame(() => {
    elements.tabList.querySelector('.document-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function slugify(value, used) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s-]+/g, '-') || 'section';
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  used.add(slug);
  return slug;
}

function scrollContentToElement(element, alignment = 'start') {
  if (!element) return;
  const scrollerRect = elements.contentScroller.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  let top = elements.contentScroller.scrollTop + elementRect.top - scrollerRect.top;
  if (alignment === 'center') top -= (elements.contentScroller.clientHeight - elementRect.height) / 2;
  else top -= 30;

  const maximum = Math.max(0, elements.contentScroller.scrollHeight - elements.contentScroller.clientHeight);
  elements.contentScroller.scrollTo({
    top: Math.max(0, Math.min(maximum, top)),
    behavior: 'smooth'
  });
}

let headingObserver = null;
function observeHeadings(headings) {
  headingObserver?.disconnect();
  if (!headings.length) return;
  headingObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      elements.outline.querySelectorAll('.outline-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.target === visible.target.id);
      });
    },
    { root: elements.contentScroller, rootMargin: '-72px 0px -72% 0px' }
  );
  headings.forEach((heading) => headingObserver.observe(heading));
}

function buildOutline() {
  const headings = [...elements.article.querySelectorAll('h1, h2, h3')];
  const used = new Set();
  elements.outline.replaceChildren();
  headings.forEach((heading) => {
    const id = slugify(heading.textContent, used);
    heading.id = id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `outline-item level-${heading.tagName.slice(1)}`;
    button.textContent = heading.textContent;
    button.dataset.target = id;
    button.addEventListener('click', () => scrollContentToElement(heading));
    elements.outline.append(button);
  });
  elements.outlineSection.hidden = headings.length === 0;
  observeHeadings(headings);
}

function addCodeCopyButtons() {
  elements.article.querySelectorAll('pre').forEach((pre) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-code';
    button.textContent = '复制';
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(pre.querySelector('code')?.textContent || pre.textContent);
      button.textContent = '已复制';
      setTimeout(() => (button.textContent = '复制'), 1200);
    });
    pre.append(button);
  });
}

function countWords(content) {
  const withoutMarkup = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/[`*_>#\[\]()!-]/g, ' ');
  const chinese = withoutMarkup.match(/[\p{Script=Han}]/gu)?.length || 0;
  const latin = withoutMarkup.match(/[\p{L}\p{N}]+/gu)?.length || 0;
  return chinese + latin;
}

function updateLineNumbers() {
  const lineCount = Math.max(1, elements.sourceEditor.value.split('\n').length);
  elements.lineNumbers.textContent = Array.from({ length: lineCount }, (_value, index) => index + 1).join('\n');
  elements.lineNumbers.style.transform = `translateY(${-elements.sourceEditor.scrollTop}px)`;
}

function syncSourceHighlightScroll() {
  elements.sourceHighlight.style.transform = `translate(${-elements.sourceEditor.scrollLeft}px, ${-elements.sourceEditor.scrollTop}px)`;
}

function updateSourceHighlight() {
  if (state.highlightFrame !== null) cancelAnimationFrame(state.highlightFrame);
  state.highlightFrame = null;
  try {
    elements.sourceHighlight.innerHTML = window.MarkdownSourceHighlighter.highlight(
      elements.sourceEditor.value,
      window.hljs,
      window.MathProtector
    );
  } catch (error) {
    console.error('Markdown source highlighting failed:', error);
    elements.sourceHighlight.textContent = elements.sourceEditor.value;
  }
  syncSourceHighlightScroll();
}

function scheduleSourceHighlight() {
  if (state.highlightFrame !== null) return;
  state.highlightFrame = requestAnimationFrame(updateSourceHighlight);
}

function updateEditorDecorations(deferHighlight = false) {
  updateLineNumbers();
  if (deferHighlight) scheduleSourceHighlight();
  else updateSourceHighlight();
}

function updateEditorPosition() {
  const cursor = elements.sourceEditor.selectionStart;
  const beforeCursor = elements.sourceEditor.value.slice(0, cursor);
  const line = (beforeCursor.match(/\n/g)?.length || 0) + 1;
  const lastBreak = beforeCursor.lastIndexOf('\n');
  const column = cursor - lastBreak;
  elements.editorPosition.textContent = `第 ${line} 行，第 ${column} 列`;
  const tab = activeTab();
  if (tab) {
    tab.selectionStart = elements.sourceEditor.selectionStart;
    tab.selectionEnd = elements.sourceEditor.selectionEnd;
    schedulePersistSession();
  }
}

function getScrollProgress(element) {
  const scrollableHeight = Math.max(0, element.scrollHeight - element.clientHeight);
  return scrollableHeight > 0 ? element.scrollTop / scrollableHeight : 0;
}

function syncScrollPosition(source, target) {
  const targetScrollableHeight = Math.max(0, target.scrollHeight - target.clientHeight);
  const targetScrollTop = getScrollProgress(source) * targetScrollableHeight;
  if (Math.abs(target.scrollTop - targetScrollTop) > 0.5) target.scrollTop = targetScrollTop;
}

function scheduleScrollSync(source) {
  const tab = activeTab();
  if (!tab?.isEditing || state.restoringPositions) return;
  state.scrollSyncSource = source;
  if (state.scrollSyncFrame !== null) return;
  state.scrollSyncFrame = requestAnimationFrame(() => {
    state.scrollSyncFrame = null;
    const activeSource = state.scrollSyncSource;
    state.scrollSyncSource = null;
    if (!activeTab()?.isEditing || !activeSource || state.restoringPositions) return;
    const target = activeSource === elements.sourceEditor ? elements.contentScroller : elements.sourceEditor;
    syncScrollPosition(activeSource, target);
  });
}

function setEditMode(editing, remember = true, syncOnShow = true) {
  const tab = activeTab();
  if (!tab) return;
  tab.isEditing = Boolean(editing);
  if (remember) {
    state.editModePreference = tab.isEditing;
    localStorage.setItem('formula-md-mode', tab.isEditing ? 'editor' : 'reader');
  }

  elements.documentArea.classList.toggle('editing', tab.isEditing);
  elements.editorPanel.hidden = !tab.isEditing;
  elements.saveButton.hidden = !tab.isEditing;
  elements.readModeButton.classList.toggle('active', !tab.isEditing);
  elements.editModeButton.classList.toggle('active', tab.isEditing);
  elements.readModeButton.setAttribute('aria-pressed', String(!tab.isEditing));
  elements.editModeButton.setAttribute('aria-pressed', String(tab.isEditing));
  elements.editStatus.hidden = !tab.isEditing;
  elements.editStatusSeparator.hidden = !tab.isEditing;

  if (tab.isEditing) {
    updateEditorDecorations();
    updateEditorPosition();
    requestAnimationFrame(() => {
      elements.sourceEditor.focus({ preventScroll: true });
      if (syncOnShow) syncScrollPosition(elements.contentScroller, elements.sourceEditor);
    });
  } else {
    elements.sourceEditor.blur();
  }
  refreshDirtyUI();
  schedulePersistSession();
}

function clearSearch(resetInput = false) {
  state.searchMarks.forEach((mark) => mark.replaceWith(document.createTextNode(mark.textContent)));
  state.searchMarks = [];
  state.currentMark = -1;
  elements.searchCount.textContent = '';
  if (resetInput) elements.searchInput.value = '';
}

function restoreTabPositions(tab, positions = null, options = {}) {
  const { restoreEditor = true } = options;
  const target = positions || {
    preview: tab.previewPosition,
    editor: tab.editorPosition,
    selectionStart: tab.selectionStart,
    selectionEnd: tab.selectionEnd
  };
  const filePath = tab.document.path;
  state.restoringPositions = true;
  const apply = () => {
    const editorRestored = window.EditorState.restoreDocumentView({
      previewElement: elements.contentScroller,
      editorElement: elements.sourceEditor,
      target,
      restorePosition,
      restoreEditor
    });
    updateLineNumbers();
    syncSourceHighlightScroll();
    if (editorRestored) updateEditorPosition();
  };

  // Apply once immediately after MathJax layout, then once more in the next
  // task for late font/layout updates. setTimeout also works while Electron is
  // backgrounded, where requestAnimationFrame may be paused.
  apply();
  setTimeout(() => {
    if (state.activePath !== filePath) return;
    apply();
    state.restoringPositions = false;
    tab.previewPosition = positionFor(elements.contentScroller);
    tab.editorPosition = positionFor(elements.sourceEditor);
    schedulePersistSession();
  }, 0);
}

async function renderActiveTab(options = {}) {
  const tab = activeTab();
  if (!tab) return;
  const { fromEditor = false, positions = null } = options;
  const positionTarget = positions || {
    preview: { ...tab.previewPosition },
    editor: { ...tab.editorPosition },
    selectionStart: tab.selectionStart,
    selectionEnd: tab.selectionEnd
  };
  const filePath = state.activePath;
  const renderId = ++state.renderId;
  state.restoringPositions = true;

  clearTimeout(state.previewTimer);
  clearSearch(true);
  if (!fromEditor) {
    elements.sourceEditor.value = tab.document.content;
    updateEditorDecorations();
  }
  elements.renderStatus.innerHTML = '<span class="status-dot busy"></span>正在排版';
  elements.engineStatus.textContent = '正在排版';

  const protectedSource = window.MathProtector.protectMath(tab.document.content);
  state.mathCount = protectedSource.math.length;
  const rendered = markdown.render(protectedSource.source);
  const sanitized = window.DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'class']
  });

  if (window.MathJax.typesetClear) window.MathJax.typesetClear([elements.article]);
  if (window.MathJax.texReset) window.MathJax.texReset();
  elements.article.innerHTML = window.MathProtector.restoreMath(sanitized, protectedSource.math);
  addCodeCopyButtons();
  buildOutline();

  try {
    await window.MathJax.startup.promise;
    if (renderId !== state.renderId || filePath !== state.activePath) return;
    await window.MathJax.typesetPromise([elements.article]);
    if (renderId !== state.renderId || filePath !== state.activePath) return;
    elements.renderStatus.innerHTML = '<span class="status-dot"></span>排版完成';
    elements.engineStatus.textContent = '引擎就绪';
  } catch (error) {
    console.error(error);
    if (renderId !== state.renderId || filePath !== state.activePath) return;
    elements.renderStatus.innerHTML = '<span class="status-dot error"></span>部分公式有误';
    elements.engineStatus.textContent = '存在公式错误';
  }

  elements.documentTitle.textContent = tab.document.name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '');
  elements.revealButton.textContent = tab.document.path;
  elements.revealButton.hidden = false;
  elements.wordCount.textContent = `${countWords(tab.document.content).toLocaleString('zh-CN')} 字`;
  elements.formulaCount.textContent = `${state.mathCount} 个公式`;
  elements.welcome.hidden = true;
  elements.article.hidden = false;
  elements.statusBar.hidden = false;
  elements.searchControl.hidden = false;
  elements.modeControl.hidden = false;
  elements.pdfButton.hidden = false;
  // A live preview render starts from the current textarea value. Reapplying
  // the selection captured before asynchronous MathJax layout would move the
  // caret backwards if the user kept typing while layout was in progress.
  if (!fromEditor) setEditMode(tab.isEditing, false, false);
  restoreTabPositions(tab, positionTarget, { restoreEditor: !fromEditor });
  refreshDirtyUI();
}

function showWelcome() {
  state.activePath = null;
  state.renderId += 1;
  clearTimeout(state.previewTimer);
  clearSearch(true);
  headingObserver?.disconnect();
  elements.outline.replaceChildren();
  elements.outlineSection.hidden = true;
  elements.documentTitle.textContent = '未打开文档';
  elements.documentTitle.classList.remove('dirty');
  elements.revealButton.hidden = true;
  elements.modeControl.hidden = true;
  elements.pdfButton.hidden = true;
  elements.searchControl.hidden = true;
  elements.saveButton.hidden = true;
  elements.editorPanel.hidden = true;
  elements.documentArea.classList.remove('editing');
  if (state.highlightFrame !== null) cancelAnimationFrame(state.highlightFrame);
  state.highlightFrame = null;
  elements.sourceHighlight.textContent = '';
  elements.article.hidden = true;
  elements.welcome.hidden = false;
  elements.statusBar.hidden = true;
  renderTabs();
  updateWindowTitle();
  window.formulaMD.setDocumentEdited(anyDirtyTabs());
  persistSession();
  loadRecents();
}

async function switchTab(filePath, saveCurrent = true) {
  const target = state.tabs.get(filePath);
  if (!target) return;
  if (saveCurrent && state.activePath && state.activePath !== filePath) syncActiveTabFromView();
  if (state.activePath === filePath && saveCurrent) {
    renderTabs();
    return;
  }

  clearTimeout(state.previewTimer);
  if (state.scrollSyncFrame !== null) cancelAnimationFrame(state.scrollSyncFrame);
  state.scrollSyncFrame = null;
  state.scrollSyncSource = null;
  state.restoringPositions = true;
  state.activePath = filePath;
  elements.sourceEditor.value = target.document.content;
  const maximumSelection = target.document.content.length;
  target.selectionStart = Math.min(target.selectionStart, maximumSelection);
  target.selectionEnd = Math.min(target.selectionEnd, maximumSelection);
  renderTabs();
  await renderActiveTab();
  persistSession();
}

async function openDocument(documentData, options = {}) {
  const { activate = true, restored = {}, editImmediately = false } = options;
  let tab = state.tabs.get(documentData.path);
  const wasActive = state.activePath === documentData.path;
  const existingPositions = tab
    ? {
        preview: { ...tab.previewPosition },
        editor: { ...tab.editorPosition },
        selectionStart: tab.selectionStart,
        selectionEnd: tab.selectionEnd
      }
    : null;
  if (tab) {
    if (!tab.dirty) {
      tab.document = documentData;
      tab.lastSavedContent = documentData.content;
    }
  } else {
    tab = createTab(documentData, restored);
    if (editImmediately) tab.isEditing = true;
    state.tabs.set(documentData.path, tab);
  }

  renderTabs();
  if (activate) {
    if (wasActive && !tab.dirty) await renderActiveTab({ positions: existingPositions });
    else await switchTab(documentData.path);
    if (editImmediately) requestAnimationFrame(() => elements.sourceEditor.focus());
  }
  schedulePersistSession();
  return tab;
}

async function chooseFile() {
  try {
    const documentData = await window.formulaMD.chooseFile();
    if (documentData) await openDocument(documentData);
  } catch (error) {
    showToast(error.message || '无法打开文件');
  }
}

async function createFile() {
  try {
    const documentData = await window.formulaMD.createFile();
    if (documentData) await openDocument(documentData, { editImmediately: true });
  } catch (error) {
    showToast(error.message || '无法新建文档');
  }
}

async function openRecent(filePath) {
  try {
    await openDocument(await window.formulaMD.openRecent(filePath));
  } catch (error) {
    showToast(error.message || '无法打开最近文档');
    await loadRecents();
  }
}

async function loadRecents() {
  const recents = await window.formulaMD.getRecentFiles();
  elements.recentList.replaceChildren();
  elements.welcomeRecents.replaceChildren();
  elements.recentSection.hidden = recents.length === 0;

  recents.slice(0, 5).forEach((item) => {
    const sidebarButton = document.createElement('button');
    sidebarButton.type = 'button';
    sidebarButton.className = 'recent-item';
    sidebarButton.title = item.path;
    sidebarButton.innerHTML = '<span class="recent-icon">M↓</span><span></span>';
    sidebarButton.lastElementChild.textContent = item.name;
    sidebarButton.addEventListener('click', () => openRecent(item.path));
    elements.recentList.append(sidebarButton);

    if (!activeTab() && elements.welcomeRecents.childElementCount < 3) {
      const welcomeButton = document.createElement('button');
      welcomeButton.type = 'button';
      welcomeButton.className = 'welcome-recent';
      welcomeButton.textContent = item.name;
      welcomeButton.title = item.path;
      welcomeButton.addEventListener('click', () => openRecent(item.path));
      elements.welcomeRecents.append(welcomeButton);
    }
  });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 200);
  }, 2600);
}

async function saveTab(tab, renderAfter = false) {
  if (!tab || !tab.dirty) return true;
  if (tab.saving) return false;
  if (tab.document.path === state.activePath) syncActiveTabFromView();
  tab.saving = true;
  refreshDirtyUI();
  try {
    const positions = tab.document.path === state.activePath
      ? {
          preview: positionFor(elements.contentScroller),
          editor: positionFor(elements.sourceEditor),
          selectionStart: elements.sourceEditor.selectionStart,
          selectionEnd: elements.sourceEditor.selectionEnd
        }
      : null;
    const savedDocument = await window.formulaMD.saveFile(tab.document.path, tab.document.content);
    const savedState = window.EditorState.reconcileSavedDocument(savedDocument, tab.document.content);
    tab.document = savedState.document;
    tab.lastSavedContent = savedState.lastSavedContent;
    tab.dirty = savedState.dirty;
    if (renderAfter && tab.document.path === state.activePath) {
      await renderActiveTab({ fromEditor: true, positions });
    }
    showToast(`${tab.document.name} 已保存`);
    return !tab.dirty;
  } catch (error) {
    showToast(error.message || '保存失败');
    return false;
  } finally {
    tab.saving = false;
    refreshDirtyUI();
    schedulePersistSession();
  }
}

async function saveDocument(closeAfter = false) {
  if (closeAfter) {
    for (const tab of state.tabs.values()) {
      if (tab.dirty && !(await saveTab(tab, tab.document.path === state.activePath))) return;
    }
    window.formulaMD.closeAfterSave();
    return;
  }
  const tab = activeTab();
  if (tab) await saveTab(tab, true);
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function exportPdf() {
  const tab = activeTab();
  if (!tab) {
    showToast('请先打开一份文档');
    return;
  }
  if (state.exportingPdf) return;

  const filePath = tab.document.path;
  syncActiveTabFromView();
  clearTimeout(state.previewTimer);
  state.exportingPdf = true;
  elements.pdfButton.disabled = true;

  try {
    const positions = {
      preview: positionFor(elements.contentScroller),
      editor: positionFor(elements.sourceEditor),
      selectionStart: elements.sourceEditor.selectionStart,
      selectionEnd: elements.sourceEditor.selectionEnd
    };
    await renderActiveTab({ fromEditor: true, positions });
    if (state.activePath !== filePath) throw new Error('导出期间活动文档已改变。');
    if (document.fonts?.ready) await document.fonts.ready;
    await nextPaint();

    const documentTitle = tab.document.name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '');
    const result = await window.formulaMD.exportPdf(tab.document.path, documentTitle);
    if (!result.canceled) showToast(`${result.name} 已保存`);
  } catch (error) {
    showToast(error.message || 'PDF 保存失败');
  } finally {
    state.exportingPdf = false;
    elements.pdfButton.disabled = false;
  }
}

async function closeTab(filePath = state.activePath) {
  const tab = state.tabs.get(filePath);
  if (!tab) return;
  if (filePath === state.activePath) syncActiveTabFromView();
  if (tab.dirty) {
    const response = await window.formulaMD.confirmCloseTab(tab.document.name);
    if (response === 2) return;
    if (response === 0 && !(await saveTab(tab))) return;
  }

  const paths = [...state.tabs.keys()];
  const closingIndex = paths.indexOf(filePath);
  state.tabs.delete(filePath);
  window.formulaMD.stopWatching(filePath);

  if (filePath === state.activePath) {
    const remaining = [...state.tabs.keys()];
    const nextPath = remaining[Math.min(closingIndex, remaining.length - 1)];
    state.activePath = null;
    if (nextPath) await switchTab(nextPath, false);
    else showWelcome();
  } else {
    renderTabs();
    refreshDirtyUI();
    persistSession();
  }
}

function switchRelativeTab(direction) {
  const paths = [...state.tabs.keys()];
  if (paths.length < 2) return;
  const currentIndex = Math.max(0, paths.indexOf(state.activePath));
  const nextIndex = (currentIndex + direction + paths.length) % paths.length;
  switchTab(paths[nextIndex]);
}

function schedulePreview() {
  clearTimeout(state.previewTimer);
  const filePath = state.activePath;
  state.previewTimer = setTimeout(() => {
    const tab = activeTab();
    if (!tab || tab.document.path !== filePath) return;
    const positions = {
      preview: positionFor(elements.contentScroller),
      editor: positionFor(elements.sourceEditor),
      selectionStart: elements.sourceEditor.selectionStart,
      selectionEnd: elements.sourceEditor.selectionEnd
    };
    renderActiveTab({ fromEditor: true, positions });
  }, 180);
}

function searchDocument(query) {
  clearSearch();
  const needle = query.trim().toLocaleLowerCase('zh-CN');
  if (!needle) return;

  const walker = document.createTreeWalker(elements.article, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent.trim() || node.parentElement.closest('script, style, mjx-container, .copy-code')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const text = node.textContent;
    const lower = text.toLocaleLowerCase('zh-CN');
    let index = lower.indexOf(needle);
    if (index === -1) return;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    while (index !== -1) {
      fragment.append(document.createTextNode(text.slice(cursor, index)));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(index, index + needle.length);
      fragment.append(mark);
      state.searchMarks.push(mark);
      cursor = index + needle.length;
      index = lower.indexOf(needle, cursor);
    }
    fragment.append(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  });

  state.currentMark = state.searchMarks.length ? 0 : -1;
  updateSearchSelection();
}

function updateSearchSelection() {
  state.searchMarks.forEach((mark, index) => mark.classList.toggle('current', index === state.currentMark));
  elements.searchCount.textContent = state.searchMarks.length
    ? `${state.currentMark + 1}/${state.searchMarks.length}`
    : elements.searchInput.value.trim()
      ? '0/0'
      : '';
  if (state.currentMark >= 0) scrollContentToElement(state.searchMarks[state.currentMark], 'center');
}

function moveSearch(direction) {
  if (!state.searchMarks.length) return;
  state.currentMark = (state.currentMark + direction + state.searchMarks.length) % state.searchMarks.length;
  updateSearchSelection();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('formula-md-theme', theme);
  const lightTheme = document.querySelector('#hljsLightTheme');
  const darkTheme = document.querySelector('#hljsDarkTheme');
  if (lightTheme && darkTheme) {
    lightTheme.disabled = theme === 'dark';
    darkTheme.disabled = theme !== 'dark';
  }
}

function initializeTheme() {
  const stored = localStorage.getItem('formula-md-theme');
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(stored || (systemDark ? 'dark' : 'light'));
}

async function restoreSession() {
  const stored = readStoredSession();
  if (!stored?.paths.length) {
    showWelcome();
    return;
  }

  for (const filePath of stored.paths) {
    try {
      const documentData = await window.formulaMD.openRecent(filePath);
      await openDocument(documentData, {
        activate: false,
        restored: stored.positions?.[filePath] || {}
      });
    } catch {
      window.formulaMD.stopWatching(filePath);
    }
  }

  const initialPath = state.tabs.has(stored.activePath) ? stored.activePath : state.tabs.keys().next().value;
  if (initialPath) await switchTab(initialPath, false);
  else showWelcome();
  await loadRecents();
}

elements.newButton.addEventListener('click', createFile);
elements.openButton.addEventListener('click', chooseFile);
elements.addTabButton.addEventListener('click', chooseFile);
elements.welcomeNewButton.addEventListener('click', createFile);
elements.welcomeOpenButton.addEventListener('click', chooseFile);
elements.revealButton.addEventListener('click', () => {
  const tab = activeTab();
  if (tab) window.formulaMD.revealFile(tab.document.path);
});
elements.readModeButton.addEventListener('click', () => setEditMode(false));
elements.editModeButton.addEventListener('click', () => setEditMode(true));
elements.saveButton.addEventListener('click', () => saveDocument());
elements.pdfButton.addEventListener('click', exportPdf);
elements.themeButton.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
elements.searchInput.addEventListener('input', () => searchDocument(elements.searchInput.value));
elements.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    moveSearch(event.shiftKey ? -1 : 1);
  }
  if (event.key === 'Escape') {
    elements.searchInput.value = '';
    clearSearch();
    elements.searchInput.blur();
  }
});

elements.sourceEditor.addEventListener('input', () => {
  const tab = activeTab();
  if (!tab) return;
  tab.document = { ...tab.document, content: elements.sourceEditor.value };
  updateEditorDecorations(true);
  updateEditorPosition();
  setDirty(elements.sourceEditor.value !== tab.lastSavedContent);
  schedulePreview();
});
elements.sourceEditor.addEventListener('scroll', () => {
  elements.lineNumbers.style.transform = `translateY(${-elements.sourceEditor.scrollTop}px)`;
  syncSourceHighlightScroll();
  const tab = activeTab();
  if (tab && !state.restoringPositions) tab.editorPosition = positionFor(elements.sourceEditor);
  schedulePersistSession();
  scheduleScrollSync(elements.sourceEditor);
});
elements.contentScroller.addEventListener('scroll', () => {
  const tab = activeTab();
  if (tab && !state.restoringPositions) tab.previewPosition = positionFor(elements.contentScroller);
  schedulePersistSession();
  scheduleScrollSync(elements.contentScroller);
});
elements.sourceEditor.addEventListener('click', updateEditorPosition);
elements.sourceEditor.addEventListener('keyup', updateEditorPosition);
elements.sourceEditor.addEventListener('select', updateEditorPosition);
elements.sourceEditor.addEventListener('compositionstart', () => {
  elements.sourceEditorStage.classList.add('composing');
});
elements.sourceEditor.addEventListener('compositionend', () => {
  elements.sourceEditorStage.classList.remove('composing');
  updateSourceHighlight();
});
elements.sourceEditor.addEventListener('blur', () => {
  elements.sourceEditorStage.classList.remove('composing');
});
elements.sourceEditor.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    elements.sourceEditor.setRangeText(
      '  ',
      elements.sourceEditor.selectionStart,
      elements.sourceEditor.selectionEnd,
      'end'
    );
    elements.sourceEditor.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (event.key.toLowerCase() === 's' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    if (event.shiftKey) exportPdf();
    else saveDocument();
  }
});

elements.article.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href?.startsWith('#')) {
    event.preventDefault();
    const targetId = decodeURIComponent(href.slice(1));
    scrollContentToElement(document.getElementById(targetId));
    return;
  }
  event.preventDefault();
  if (href) window.formulaMD.openExternal(link.href);
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 'Tab') {
    event.preventDefault();
    switchRelativeTab(event.shiftKey ? -1 : 1);
  }
});

let dragDepth = 0;
document.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  elements.dropOverlay.classList.add('visible');
});
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('dragleave', () => {
  dragDepth -= 1;
  if (dragDepth <= 0) {
    dragDepth = 0;
    elements.dropOverlay.classList.remove('visible');
  }
});
document.addEventListener('drop', async (event) => {
  event.preventDefault();
  dragDepth = 0;
  elements.dropOverlay.classList.remove('visible');
  const file = event.dataTransfer.files[0];
  if (!file) return;
  try {
    await openDocument(await window.formulaMD.readFile(file));
  } catch (error) {
    showToast(error.message || '无法打开此文件');
  }
});

window.addEventListener('beforeunload', () => {
  syncActiveTabFromView();
  persistSession();
});

window.formulaMD.onDocumentCreated((documentData) => openDocument(documentData, { editImmediately: true }));
window.formulaMD.onDocumentOpened((documentData) => openDocument(documentData));
window.formulaMD.onDocumentChanged(async (documentData) => {
  const tab = state.tabs.get(documentData.path);
  if (!tab) return;
  if (tab.dirty) {
    if (documentData.path === state.activePath) showToast('文件在外部发生变化；当前未保存内容已保留');
    return;
  }
  tab.document = documentData;
  tab.lastSavedContent = documentData.content;
  if (documentData.path === state.activePath) {
    syncActiveTabFromView();
    const positions = {
      preview: tab.previewPosition,
      editor: tab.editorPosition,
      selectionStart: tab.selectionStart,
      selectionEnd: tab.selectionEnd
    };
    tab.document = documentData;
    elements.sourceEditor.value = documentData.content;
    showToast('检测到文件更新，已重新排版');
    await renderActiveTab({ positions });
  }
});
window.formulaMD.onDocumentError((error) => {
  showToast(typeof error === 'string' ? error : error?.message || '文档读取失败');
});
window.formulaMD.onFocusSearch(() => {
  if (!activeTab()) return;
  elements.searchInput.focus();
  elements.searchInput.select();
});
window.formulaMD.onSaveDocument(() => saveDocument());
window.formulaMD.onExportPdf(exportPdf);
window.formulaMD.onToggleEditor(() => {
  const tab = activeTab();
  if (tab) setEditMode(!tab.isEditing);
});
window.formulaMD.onCloseTab(() => closeTab());
window.formulaMD.onSwitchTab(switchRelativeTab);
window.formulaMD.onSaveRequested((closeAfter) => saveDocument(closeAfter));

initializeTheme();
loadRecents();
restoreSession();
window.MathJax.startup.promise
  .then(() => {
    elements.engineStatus.textContent = '引擎就绪';
  })
  .catch(() => {
    elements.engineStatus.textContent = '引擎加载失败';
  });
