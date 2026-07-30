import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const highlighter = require('../node_modules/@highlightjs/cdn-assets/highlight.js');
const mathProtector = require('../src/renderer/math-protector.js');
const { highlight, languageFromInfo } = require('../src/renderer/markdown-source-highlighter.js');

function render(source) {
  return highlight(source, highlighter, mathProtector);
}

function textFromMarkup(markup) {
  return markup
    .replace(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

test('Markdown source is colorized without changing its text', () => {
  const source = [
    '# 标题',
    '',
    '- **粗体**、*斜体*与[链接](https://example.com)',
    '',
    '`inline()`'
  ].join('\n');
  const result = render(source);

  assert.match(result, /hljs-section/);
  assert.match(result, /hljs-bullet/);
  assert.match(result, /hljs-strong/);
  assert.match(result, /hljs-link/);
  assert.match(result, /hljs-code/);
  assert.equal(textFromMarkup(result), source);
});

test('fenced source uses its declared programming language', () => {
  const source = [
    '```javascript',
    'const answer = 42;',
    'console.log(answer);',
    '```',
    ''
  ].join('\n');
  const result = render(source);

  assert.match(result, /source-fence-marker/);
  assert.match(result, /source-fence-language/);
  assert.match(result, /hljs-keyword/);
  assert.match(result, /hljs-number/);
  assert.equal(textFromMarkup(result), source);
});

test('unknown fenced languages and HTML-like input remain safely escaped', () => {
  const source = '~~~not-installed\n<script>alert("x")</script>\n~~~';
  const result = render(source);

  assert.doesNotMatch(result, /<script>/);
  assert.match(result, /&lt;script&gt;/);
  assert.equal(textFromMarkup(result), source);
});

test('common fenced-code info string forms resolve to a language name', () => {
  assert.equal(languageFromInfo(' js title="demo"'), 'js');
  assert.equal(languageFromInfo(' {.python}'), 'python');
  assert.equal(languageFromInfo(' .typescript'), 'typescript');
});

test('LaTeX underscores do not consume later Markdown syntax', () => {
  const source = [
    '## 公式',
    '',
    '$$',
    '\\sum_{i=1}^{n} i',
    '$$',
    '',
    '## 后续标题'
  ].join('\n');
  const result = render(source);

  assert.equal(result.match(/hljs-section/g)?.length, 2);
  assert.match(result, /source-math/);
  assert.equal(textFromMarkup(result), source);
});
