const importAnchors = new Set();
function updateImportAnchors(tab, content) {
  for (const anchor of importAnchors) if (anchor.tab === tab) window.InsertionAnchor.rebase(anchor, content);
}
async function prepareArticleImages(fragment, filePath) {
  // A template is inert: no document-relative or remote requests occur before validation.
  fragment.querySelectorAll('[srcset]').forEach((element) => element.removeAttribute('srcset'));
  const nodes = [...fragment.querySelectorAll('img')];
  const sources = nodes.map((node) => node.getAttribute('src') || '');
  nodes.forEach((node) => node.removeAttribute('src'));
  if (!nodes.length) return () => Promise.resolve();
  const resources = await window.formulaMD.prepareImages(filePath, sources);
  const pending = nodes.map((node, index) => new Promise((resolve) => {
    const resource = resources[index];
    let finished = false;
    let timer;
    const finish = async (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) {
        const placeholder = document.createElement('span');
        placeholder.className = 'image-placeholder';
        placeholder.setAttribute('role', 'img');
        const reason = resource.error || await window.formulaMD.imageError(resource.url).catch(() => '图片加载失败');
        placeholder.textContent = `${node.alt || '图片'} — ${reason}`;
        placeholder.setAttribute('aria-label', placeholder.textContent);
        placeholder.title = sources[index].startsWith('data:') ? '内嵌图片' : sources[index];
        node.replaceWith(placeholder);
      }
      scheduleScrollAnchorRebuild();
      resolve();
    };
    if (resource.error) { finish(true); return; }
    node.addEventListener('load', () => finish(false), { once: true });
    node.addEventListener('error', () => finish(true), { once: true });
    node.decoding = 'async';
    node.loading = 'eager';
    node.referrerPolicy = 'no-referrer';
    node.src = resource.url;
    timer = setTimeout(() => finish(true), 18000);
  }));
  return () => Promise.all(pending);
}
async function insertImages(importer) {
  const tab = activeTab();
  if (!tab) return showToast('请先新建或打开文档');
  syncActiveTabFromView();
  const anchor = { tab, path: tab.document.path, content: tab.document.content,
    start: elements.sourceEditor.selectionStart, end: elements.sourceEditor.selectionEnd, invalid: false };
  importAnchors.add(anchor);
  if (!tab.isEditing) setEditMode(true);
  try {
    const results = await importer(anchor.path);
    const successful = results.filter((result) => result.markdown);
    const errors = results.filter((result) => result.error);
    if (!successful.length) { if (errors.length) showToast(errors.map((item) => item.error).join('；')); return; }
    if (state.tabs.get(anchor.path) !== tab) return showToast('原文档已关闭，图片已保存在资源目录。');
    const content = state.activePath === anchor.path ? elements.sourceEditor.value : tab.document.content;
    window.InsertionAnchor.rebase(anchor, content);
    if (anchor.invalid) return showToast('插入位置的内容已改变，未覆盖输入；图片已保存在资源目录。');
    const insertion = `${anchor.start && content[anchor.start - 1] !== '\n' ? '\n' : ''}${successful.map((item) => item.markdown).join('\n')}\n`;
    if (new TextEncoder().encode(content).length + new TextEncoder().encode(insertion).length > 20 * 1024 * 1024) throw new Error('插入后文档超过 20 MB，图片已保存在资源目录。');
    importAnchors.delete(anchor);
    if (state.activePath === anchor.path) {
      elements.sourceEditor.focus({ preventScroll: true });
      elements.sourceEditor.setSelectionRange(anchor.start, anchor.end);
      // Chromium's editing command preserves a single native undo transaction.
      if (!document.execCommand('insertText', false, insertion)) throw new Error('无法插入图片，请重新定位光标后重试。');
      // Keep state consistent even when the platform omits an input event.
      if (tab.document.content !== elements.sourceEditor.value) elements.sourceEditor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      tab.document = { ...tab.document, content: content.slice(0, anchor.start) + insertion + content.slice(anchor.end) };
      tab.dirty = tab.document.content !== tab.lastSavedContent;
      tab.selectionStart = tab.selectionEnd = anchor.start + insertion.length;
      updateImportAnchors(tab, tab.document.content);
      refreshDirtyUI();
    }
    showToast(`已插入 ${successful.length} 张图片${errors.length ? `；${errors.length} 张导入失败：${errors[0].error}` : ''}`);
  } catch (error) { showToast(error.message || '图片导入失败'); }
  finally { importAnchors.delete(anchor); }
}
function chooseImages() { return insertImages((filePath) => window.formulaMD.chooseImages(filePath)); }
function setupImageActions() {
  elements.insertImageButton.addEventListener('click', chooseImages);
  elements.sourceEditor.addEventListener('paste', (event) => {
    const items = [...(event.clipboardData?.items || [])].filter((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!items.length) return;
    event.preventDefault();
    const files = items.map((item) => item.getAsFile()).filter(Boolean);
    insertImages(async (filePath) => {
      const images = await Promise.all(files.map(async (file) => {
        if (file.size > 20 * 1024 * 1024) throw new Error('剪贴板图片超过 20 MB。');
        return { name: file.name || '剪贴板图片.png', bytes: new Uint8Array(await file.arrayBuffer()) };
      }));
      return window.formulaMD.importImages(filePath, images);
    });
  });
}
