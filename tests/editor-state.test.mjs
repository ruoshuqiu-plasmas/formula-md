import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { reconcileSavedDocument, restoreDocumentView } = require('../src/renderer/editor-state.js');

function createEditor(value, selectionStart, selectionEnd, scrollTop = 0) {
  const selectionCalls = [];
  return {
    value,
    selectionStart,
    selectionEnd,
    scrollTop,
    selectionCalls,
    setSelectionRange(start, end) {
      selectionCalls.push([start, end]);
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };
}

function restorePosition(element, position) {
  element.scrollTop = position.top;
}

test('live preview restoration leaves the current editor caret and scroll untouched', () => {
  const previewElement = { scrollTop: 90 };
  const editorElement = createEditor('abcd', 4, 4, 120);

  const editorRestored = restoreDocumentView({
    previewElement,
    editorElement,
    target: {
      preview: { top: 24 },
      editor: { top: 10 },
      selectionStart: 3,
      selectionEnd: 3
    },
    restorePosition,
    restoreEditor: false
  });

  assert.equal(editorRestored, false);
  assert.equal(previewElement.scrollTop, 24);
  assert.equal(editorElement.scrollTop, 120);
  assert.deepEqual([editorElement.selectionStart, editorElement.selectionEnd], [4, 4]);
  assert.deepEqual(editorElement.selectionCalls, []);
});

test('full view restoration still restores the saved editor caret and scroll', () => {
  const previewElement = { scrollTop: 90 };
  const editorElement = createEditor('abcd', 4, 4, 120);

  const editorRestored = restoreDocumentView({
    previewElement,
    editorElement,
    target: {
      preview: { top: 24 },
      editor: { top: 10 },
      selectionStart: 2,
      selectionEnd: 3
    },
    restorePosition
  });

  assert.equal(editorRestored, true);
  assert.equal(previewElement.scrollTop, 24);
  assert.equal(editorElement.scrollTop, 10);
  assert.deepEqual([editorElement.selectionStart, editorElement.selectionEnd], [2, 3]);
  assert.deepEqual(editorElement.selectionCalls, [[2, 3]]);
});

test('save reconciliation preserves input made while the disk write was pending', () => {
  const savedDocument = {
    path: '/tmp/example.md',
    name: 'example.md',
    content: 'saved version',
    modifiedAt: 1
  };

  const result = reconcileSavedDocument(savedDocument, 'newer editor version');

  assert.equal(result.document.content, 'newer editor version');
  assert.equal(result.lastSavedContent, 'saved version');
  assert.equal(result.dirty, true);
});

test('save reconciliation marks the editor clean when no newer input exists', () => {
  const savedDocument = {
    path: '/tmp/example.md',
    name: 'example.md',
    content: 'saved version',
    modifiedAt: 1
  };

  const result = reconcileSavedDocument(savedDocument, 'saved version');

  assert.equal(result.document, savedDocument);
  assert.equal(result.lastSavedContent, 'saved version');
  assert.equal(result.dirty, false);
});
