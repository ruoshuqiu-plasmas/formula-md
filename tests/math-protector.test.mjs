import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { protectMath, restoreMath } = require('../src/renderer/math-protector.js');

test('protects inline and display math without Markdown corruption', () => {
  const input = 'Inline $a_i^2 + b_i^2 = c_i^2$ here.\n\n$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$';
  const result = protectMath(input);
  assert.equal(result.math.length, 2);
  assert.ok(!result.source.includes('a_i'));
  assert.equal(restoreMath(result.source, result.math), input);
});

test('supports bracket delimiters and AMS environments', () => {
  const input = '\\[\\mathbf{A}=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\\]\n\n\\begin{align}a&=b+c\\\\d&=e\\end{align}';
  const result = protectMath(input);
  assert.equal(result.math.length, 2);
  assert.equal(
    restoreMath(result.source, result.math),
    '\\[\\mathbf{A}=\\begin{bmatrix}1&amp;2\\\\3&amp;4\\end{bmatrix}\\]\n\n\\begin{align}a&amp;=b+c\\\\d&amp;=e\\end{align}'
  );
});

test('leaves formulas inside code spans and fenced code untouched', () => {
  const input = '`$not_math$`\n\n```tex\n$x_1$\n```\n\nActual $x_1$.';
  const result = protectMath(input);
  assert.equal(result.math.length, 1);
  assert.match(result.source, /`\$not_math\$`/);
  assert.match(result.source, /```tex\n\$x_1\$\n```/);
});

test('does not treat common currency text as math', () => {
  const input = 'The price is $5 and the discount is $2. Use $x+2$ for math.';
  const result = protectMath(input);
  assert.equal(result.math.length, 1);
  assert.equal(result.math[0], '$x+2$');
});

test('escapes formula HTML when restoring placeholders', () => {
  const result = protectMath('$x < y$');
  assert.equal(restoreMath(result.source, result.math), '$x &lt; y$');
});
