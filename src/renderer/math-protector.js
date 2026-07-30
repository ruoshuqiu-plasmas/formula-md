(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MathProtector = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TOKEN_PREFIX = 'FORMULAMDPROTECTEDMATH';

  function isEscaped(source, index) {
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1;
    return slashes % 2 === 1;
  }

  function findClosing(source, start, close, sameLine) {
    let cursor = start;
    while (cursor < source.length) {
      if (sameLine && source[cursor] === '\n') return -1;
      if (source.startsWith(close, cursor) && !isEscaped(source, cursor)) return cursor;
      cursor += 1;
    }
    return -1;
  }

  function countRun(source, start, character) {
    let length = 0;
    while (source[start + length] === character) length += 1;
    return length;
  }

  function protectMath(source) {
    const math = [];
    let output = '';
    let cursor = 0;
    let fence = null;
    let lineStart = true;

    const save = (value) => {
      const token = `${TOKEN_PREFIX}${math.length}ENDTOKEN`;
      math.push(value);
      output += token;
    };

    while (cursor < source.length) {
      const character = source[cursor];

      if (lineStart) {
        const fenceMatch = source.slice(cursor).match(/^( {0,3})(`{3,}|~{3,})/);
        if (fenceMatch) {
          const marker = fenceMatch[2][0];
          const length = fenceMatch[2].length;
          if (!fence) fence = { marker, length };
          else if (fence.marker === marker && length >= fence.length) fence = null;
        }
      }

      if (character === '\n') {
        output += character;
        cursor += 1;
        lineStart = true;
        continue;
      }

      if (lineStart && character !== ' ' && character !== '\t') lineStart = false;

      if (fence) {
        output += character;
        cursor += 1;
        continue;
      }

      if (character === '`') {
        const runLength = countRun(source, cursor, '`');
        const delimiter = '`'.repeat(runLength);
        const closing = source.indexOf(delimiter, cursor + runLength);
        if (closing !== -1) {
          output += source.slice(cursor, closing + runLength);
          cursor = closing + runLength;
          continue;
        }
      }

      let close = null;
      let sameLine = false;
      let environmentEnd = null;

      if (source.startsWith('$$', cursor) && !isEscaped(source, cursor)) {
        close = '$$';
      } else if (source.startsWith('\\[', cursor) && !isEscaped(source, cursor)) {
        close = '\\]';
      } else if (source.startsWith('\\(', cursor) && !isEscaped(source, cursor)) {
        close = '\\)';
        sameLine = true;
      } else if (source.startsWith('\\begin{', cursor) && !isEscaped(source, cursor)) {
        const match = source.slice(cursor).match(/^\\begin\{([a-zA-Z*]+)\}/);
        if (match) environmentEnd = `\\end{${match[1]}}`;
      } else if (character === '$' && !isEscaped(source, cursor)) {
        const next = source[cursor + 1];
        if (next && !/\s|\$/.test(next)) {
          close = '$';
          sameLine = true;
        }
      }

      if (environmentEnd) {
        const closing = findClosing(source, cursor + 1, environmentEnd, false);
        if (closing !== -1) {
          const end = closing + environmentEnd.length;
          save(source.slice(cursor, end));
          cursor = end;
          continue;
        }
      } else if (close) {
        const closing = findClosing(source, cursor + close.length, close, sameLine);
        const validInlineClose = close !== '$' || (closing !== -1 && !/\s/.test(source[closing - 1]));
        if (closing !== -1 && validInlineClose) {
          const end = closing + close.length;
          save(source.slice(cursor, end));
          cursor = end;
          continue;
        }
      }

      output += character;
      cursor += 1;
    }

    return { source: output, math };
  }

  function escapeHtml(value) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function restoreMath(html, math) {
    return math.reduce(
      // A replacement callback is required here: replacement strings interpret
      // `$$` as a special sequence and would silently collapse display delimiters.
      (result, value, index) => result.replaceAll(`${TOKEN_PREFIX}${index}ENDTOKEN`, () => escapeHtml(value)),
      html
    );
  }

  return { protectMath, restoreMath, escapeHtml };
});
