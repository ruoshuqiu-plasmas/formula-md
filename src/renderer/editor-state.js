(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EditorState = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function restoreDocumentView({
    previewElement,
    editorElement,
    target,
    restorePosition,
    restoreEditor = true
  }) {
    restorePosition(previewElement, target.preview);
    if (!restoreEditor) return false;

    restorePosition(editorElement, target.editor);
    const maximumSelection = editorElement.value.length;
    const start = Math.max(0, Math.min(maximumSelection, target.selectionStart || 0));
    const end = Math.max(start, Math.min(maximumSelection, target.selectionEnd || start));
    editorElement.setSelectionRange(start, end);
    return true;
  }

  function reconcileSavedDocument(savedDocument, currentContent) {
    const dirty = currentContent !== savedDocument.content;
    return {
      document: dirty ? { ...savedDocument, content: currentContent } : savedDocument,
      lastSavedContent: savedDocument.content,
      dirty
    };
  }

  return { restoreDocumentView, reconcileSavedDocument };
});
