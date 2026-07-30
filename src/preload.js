const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('formulaMD', {
  createFile: () => ipcRenderer.invoke('document:create'),
  chooseFile: () => ipcRenderer.invoke('document:choose'),
  readFile: (file) => ipcRenderer.invoke('document:read', webUtils.getPathForFile(file)),
  openRecent: (filePath) => ipcRenderer.invoke('document:read', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('document:save', filePath, content),
  exportPdf: (sourcePath, documentTitle) =>
    ipcRenderer.invoke('document:export-pdf', sourcePath, documentTitle),
  setDocumentEdited: (edited) => ipcRenderer.send('document:edited', edited),
  stopWatching: (filePath) => ipcRenderer.send('document:unwatch', filePath),
  confirmCloseTab: (name) => ipcRenderer.invoke('document:confirm-close', name),
  closeAfterSave: () => ipcRenderer.send('editor:close-after-save'),
  getRecentFiles: () => ipcRenderer.invoke('document:recent'),
  revealFile: (filePath) => ipcRenderer.invoke('document:reveal', filePath),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  onDocumentCreated: (callback) => ipcRenderer.on('document:created', (_event, document) => callback(document)),
  onDocumentOpened: (callback) => ipcRenderer.on('document:opened', (_event, document) => callback(document)),
  onDocumentChanged: (callback) => ipcRenderer.on('document:changed', (_event, document) => callback(document)),
  onDocumentError: (callback) => ipcRenderer.on('document:error', (_event, message) => callback(message)),
  onFocusSearch: (callback) => ipcRenderer.on('view:focus-search', callback),
  onSaveDocument: (callback) => ipcRenderer.on('view:save-document', callback),
  onExportPdf: (callback) => ipcRenderer.on('view:export-pdf', callback),
  onToggleEditor: (callback) => ipcRenderer.on('view:toggle-editor', callback),
  onCloseTab: (callback) => ipcRenderer.on('view:close-tab', callback),
  onSwitchTab: (callback) => ipcRenderer.on('view:switch-tab', (_event, direction) => callback(direction)),
  onSaveRequested: (callback) => ipcRenderer.on('editor:save-requested', (_event, closeAfter) => callback(closeAfter))
});
