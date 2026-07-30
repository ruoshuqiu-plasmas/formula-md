const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.txt']);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// During development Electron otherwise uses the shared name/user-data folder
// "Electron", which can leak recent files between unrelated local apps.
app.setName('Formula MD');

let mainWindow = null;
const fileWatchers = new Map();
const ignoreWatchUntil = new Map();
let pendingOpenPath = null;
let forceClose = false;
let hasUnsavedChanges = false;

function setWindowDocumentEdited(edited) {
  hasUnsavedChanges = Boolean(edited);
  if (process.platform === 'darwin' && typeof mainWindow?.setDocumentEdited === 'function') {
    mainWindow.setDocumentEdited(hasUnsavedChanges);
  }
}

function recentFilePath() {
  return path.join(app.getPath('userData'), 'recent-files.json');
}

async function getRecentFiles() {
  try {
    const stored = JSON.parse(await fsPromises.readFile(recentFilePath(), 'utf8'));
    if (!Array.isArray(stored)) return [];
    const existing = [];
    for (const item of stored.slice(0, 8)) {
      if (typeof item?.path === 'string' && fs.existsSync(item.path)) existing.push(item);
    }
    return existing;
  } catch {
    return [];
  }
}

async function rememberFile(filePath) {
  const existing = await getRecentFiles();
  const next = [
    { path: filePath, name: path.basename(filePath), openedAt: Date.now() },
    ...existing.filter((item) => item.path !== filePath)
  ].slice(0, 8);
  await fsPromises.mkdir(app.getPath('userData'), { recursive: true });
  await fsPromises.writeFile(recentFilePath(), JSON.stringify(next, null, 2), 'utf8');
  rebuildMenu();
  return next;
}

function stopWatching(filePath) {
  const resolved = filePath ? path.resolve(filePath) : null;
  if (resolved) {
    const entry = fileWatchers.get(resolved);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.watcher.close();
    fileWatchers.delete(resolved);
    ignoreWatchUntil.delete(resolved);
    return;
  }

  for (const entry of fileWatchers.values()) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.watcher.close();
  }
  fileWatchers.clear();
  ignoreWatchUntil.clear();
}

function watchFile(filePath) {
  const resolved = path.resolve(filePath);
  if (fileWatchers.has(resolved)) return;
  try {
    const entry = { watcher: null, timer: null };
    entry.watcher = fs.watch(resolved, () => {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(async () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (Date.now() < (ignoreWatchUntil.get(resolved) || 0)) return;
        try {
          const document = await readMarkdownFile(resolved, false);
          mainWindow.webContents.send('document:changed', document);
        } catch (error) {
          mainWindow.webContents.send('document:error', { path: resolved, message: error.message });
        }
      }, 180);
    });
    fileWatchers.set(resolved, entry);
  } catch {
    // A failed watcher should not prevent the file from being read.
  }
}

async function saveMarkdownFile(filePath, content) {
  if (!filePath) throw new Error('当前没有可保存的文档。');
  if (typeof content !== 'string') throw new Error('文档内容无效。');
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE) {
    throw new Error('文档超过 20 MB，无法安全保存。');
  }

  const resolved = path.resolve(filePath);
  const extension = path.extname(resolved).toLowerCase();
  if (!MARKDOWN_EXTENSIONS.has(extension)) throw new Error('无法保存此文件类型。');

  ignoreWatchUntil.set(resolved, Date.now() + 1200);
  await fsPromises.writeFile(resolved, content, 'utf8');
  const stats = await fsPromises.stat(resolved);
  ignoreWatchUntil.set(resolved, Date.now() + 1200);
  watchFile(resolved);

  return {
    path: resolved,
    name: path.basename(resolved),
    content,
    size: stats.size,
    modifiedAt: stats.mtimeMs
  };
}

async function readMarkdownFile(filePath, remember = true) {
  const resolved = path.resolve(filePath);
  const extension = path.extname(resolved).toLowerCase();
  if (!MARKDOWN_EXTENSIONS.has(extension)) {
    throw new Error('请选择 Markdown 或纯文本文件。');
  }

  const stats = await fsPromises.stat(resolved);
  if (!stats.isFile()) throw new Error('所选路径不是文件。');
  if (stats.size > MAX_FILE_SIZE) throw new Error('文件超过 20 MB，无法安全打开。');

  let content = await fsPromises.readFile(resolved, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  watchFile(resolved);
  if (remember) await rememberFile(resolved);

  return {
    path: resolved,
    name: path.basename(resolved),
    content,
    size: stats.size,
    modifiedAt: stats.mtimeMs
  };
}

async function chooseMarkdownFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '打开 Markdown 文档',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: '纯文本', extensions: ['txt'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return readMarkdownFile(result.filePaths[0]);
}

function ensureMarkdownExtension(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (['.md', '.markdown', '.mdown', '.mkd'].includes(extension)) return filePath;
  return `${filePath}.md`;
}

function pdfDefaultPath(sourcePath) {
  const fallbackDirectory = app.getPath('documents');
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    return path.join(fallbackDirectory, '未命名.pdf');
  }

  const parsed = path.parse(sourcePath);
  const directory = path.isAbsolute(sourcePath) ? parsed.dir : fallbackDirectory;
  const safeName = parsed.name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[.\s]+$/g, '')
    .trim();
  return path.join(directory, `${safeName || '未命名'}.pdf`);
}

function ensurePdfExtension(filePath) {
  return path.extname(filePath).toLowerCase() === '.pdf' ? filePath : `${filePath}.pdf`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function exportCurrentDocumentAsPdf(sourcePath, documentTitle) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('应用窗口不可用。');

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存为 PDF',
    buttonLabel: '保存',
    defaultPath: pdfDefaultPath(sourcePath),
    filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    properties: ['showOverwriteConfirmation']
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const outputPath = ensurePdfExtension(result.filePath);
  if (outputPath !== result.filePath && fs.existsSync(outputPath)) {
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '文件已存在',
      message: `${path.basename(outputPath)} 已存在。是否替换？`,
      detail: outputPath,
      buttons: ['取消', '替换'],
      defaultId: 0,
      cancelId: 0
    });
    if (confirmation.response !== 1) return { canceled: true };
  }

  const title = escapeHtml(
    typeof documentTitle === 'string' && documentTitle.trim() ? documentTitle.trim() : 'Markdown 文档'
  );
  const pdf = await mainWindow.webContents.printToPDF({
    pageSize: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    preferCSSPageSize: true,
    generateTaggedPDF: true,
    generateDocumentOutline: true,
    headerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 17mm;color:#8b918d;font:8px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>`,
    footerTemplate: "<div style=\"box-sizing:border-box;display:flex;width:100%;padding:0 17mm;justify-content:space-between;color:#8b918d;font:8px -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif\"><span>Formula MD</span><span><span class=\"pageNumber\"></span> / <span class=\"totalPages\"></span></span></div>"
  });

  await fsPromises.writeFile(outputPath, pdf);
  return {
    canceled: false,
    path: outputPath,
    name: path.basename(outputPath),
    size: pdf.length
  };
}

async function createBlankMarkdownFile() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '新建 Markdown 文档',
    buttonLabel: '新建',
    defaultPath: path.join(app.getPath('documents'), '未命名.md'),
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] }],
    properties: ['showOverwriteConfirmation']
  });
  if (result.canceled || !result.filePath) return null;

  const filePath = ensureMarkdownExtension(result.filePath);
  if (filePath !== result.filePath && fs.existsSync(filePath)) {
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '文件已存在',
      message: `${path.basename(filePath)} 已存在。是否替换？`,
      detail: filePath,
      buttons: ['取消', '替换'],
      defaultId: 0,
      cancelId: 0
    });
    if (confirmation.response !== 1) return null;
  }

  await fsPromises.writeFile(filePath, '', 'utf8');
  return readMarkdownFile(filePath);
}

function isSafeExternalUrl(value) {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function openPathInWindow(filePath) {
  try {
    const document = await readMarkdownFile(filePath);
    if (!mainWindow) {
      pendingOpenPath = filePath;
      return;
    }
    mainWindow.webContents.send('document:opened', document);
    mainWindow.show();
  } catch (error) {
    if (mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: '无法打开文档',
        message: error.message
      });
    }
  }
}

async function buildMenuTemplate() {
  const recent = await getRecentFiles();
  return [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '新建 Markdown 文档…',
          accelerator: 'CommandOrControl+N',
          click: async () => {
            const document = await createBlankMarkdownFile();
            if (document) mainWindow?.webContents.send('document:created', document);
          }
        },
        {
          label: '打开…',
          accelerator: 'CommandOrControl+O',
          click: async () => {
            const document = await chooseMarkdownFile();
            if (document) mainWindow?.webContents.send('document:opened', document);
          }
        },
        {
          label: '保存',
          accelerator: 'CommandOrControl+S',
          click: () => mainWindow?.webContents.send('view:save-document')
        },
        {
          label: '保存为 PDF…',
          accelerator: 'CommandOrControl+Shift+S',
          click: () => mainWindow?.webContents.send('view:export-pdf')
        },
        { type: 'separator' },
        {
          label: '关闭标签页',
          accelerator: 'CommandOrControl+W',
          click: () => mainWindow?.webContents.send('view:close-tab')
        },
        { type: 'separator' },
        {
          label: '最近打开',
          submenu: recent.length
            ? recent.map((item) => ({ label: item.name, click: () => openPathInWindow(item.path) }))
            : [{ label: '无最近项目', enabled: false }]
        },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: '查找',
          accelerator: 'CommandOrControl+F',
          click: () => mainWindow?.webContents.send('view:focus-search')
        },
        {
          label: '切换编辑模式',
          accelerator: 'CommandOrControl+E',
          click: () => mainWindow?.webContents.send('view:toggle-editor')
        }
      ]
    },
    {
      label: '显示',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: '上一个标签页',
          accelerator: 'CommandOrControl+Shift+[',
          click: () => mainWindow?.webContents.send('view:switch-tab', -1)
        },
        {
          label: '下一个标签页',
          accelerator: 'CommandOrControl+Shift+]',
          click: () => mainWindow?.webContents.send('view:switch-tab', 1)
        },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ];
}

async function rebuildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(await buildMenuTemplate()));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Formula MD',
    backgroundColor: '#f7f7f4',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 18, y: 17 },
          vibrancy: 'sidebar',
          visualEffectState: 'active'
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Prevent macOS rubber-band scrolling from moving the entire window.
      scrollBounce: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', (event) => {
    if (forceClose || !hasUnsavedChanges) return;
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: '保存文档？',
      message: '当前 Markdown 文档包含未保存的更改。',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2
    });

    if (response === 0) {
      event.preventDefault();
      mainWindow?.webContents.send('editor:save-requested', true);
    } else if (response === 1 && mainWindow) {
      setWindowDocumentEdited(false);
    } else {
      event.preventDefault();
    }
  });
  mainWindow.on('closed', () => {
    stopWatching();
    forceClose = false;
    hasUnsavedChanges = false;
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process exited:', details.reason);
  });
}

ipcMain.handle('document:choose', chooseMarkdownFile);
ipcMain.handle('document:create', createBlankMarkdownFile);
ipcMain.handle('document:read', (_event, filePath) => readMarkdownFile(filePath));
ipcMain.handle('document:save', (_event, filePath, content) => saveMarkdownFile(filePath, content));
ipcMain.handle('document:export-pdf', (_event, sourcePath, documentTitle) =>
  exportCurrentDocumentAsPdf(sourcePath, documentTitle)
);
ipcMain.handle('document:recent', getRecentFiles);
ipcMain.handle('document:reveal', async (_event, filePath) => {
  if (filePath) shell.showItemInFolder(path.resolve(filePath));
});
ipcMain.handle('document:confirm-close', async (_event, name) => {
  if (!mainWindow) return 2;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '保存文档？',
    message: `${name || '此文档'} 包含未保存的更改。`,
    buttons: ['保存', '不保存', '取消'],
    defaultId: 0,
    cancelId: 2
  });
  return result.response;
});
ipcMain.handle('external:open', async (_event, url) => {
  if (!isSafeExternalUrl(url)) return false;
  await shell.openExternal(url);
  return true;
});
ipcMain.on('document:edited', (_event, edited) => {
  setWindowDocumentEdited(edited);
});
ipcMain.on('document:unwatch', (_event, filePath) => stopWatching(filePath));
ipcMain.on('editor:close-after-save', () => {
  if (!mainWindow) return;
  forceClose = true;
  setWindowDocumentEdited(false);
  mainWindow.close();
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady() && mainWindow) openPathInWindow(filePath);
  else pendingOpenPath = filePath;
});

app.whenReady().then(async () => {
  createWindow();
  await rebuildMenu();

  const cliPath = process.argv.slice(1).find((value) => MARKDOWN_EXTENSIONS.has(path.extname(value).toLowerCase()));
  const initialPath = pendingOpenPath || cliPath;
  if (initialPath) {
    mainWindow.webContents.once('did-finish-load', () => openPathInWindow(initialPath));
    pendingOpenPath = null;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
