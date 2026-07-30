(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MarkdownSourceHighlighter = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MAX_HIGHLIGHT_LENGTH = 2 * 1024 * 1024;

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function sourceLines(source) {
    const lines = [];
    const pattern = /([^\r\n]*)(\r\n|\n|\r|$)/g;
    let match;
    while ((match = pattern.exec(source)) && match.index < source.length) {
      lines.push({
        text: match[1],
        eol: match[2],
        start: match.index,
        end: pattern.lastIndex
      });
    }
    return lines;
  }

  function languageFromInfo(info) {
    const firstWord = info.trim().split(/\s+/, 1)[0] || '';
    return firstWord
      .replace(/^\{\./, '')
      .replace(/^\./, '')
      .replace(/[},].*$/, '');
  }

  function highlightWith(highlighter, source, language) {
    if (!source) return '';
    if (!highlighter?.highlight || !highlighter?.getLanguage?.(language)) return escapeHtml(source);
    try {
      return highlighter.highlight(source, { language, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(source);
    }
  }

  function highlightMarkdown(highlighter, source, mathProtector) {
    if (!source) return '';
    if (!mathProtector?.protectMath) return highlightWith(highlighter, source, 'markdown');

    const protectedMath = mathProtector.protectMath(source);
    const highlighted = highlightWith(highlighter, protectedMath.source, 'markdown');
    return highlighted.replace(
      /FORMULAMDPROTECTEDMATH(\d+)ENDTOKEN/g,
      (token, index) => {
        const formula = protectedMath.math[Number(index)];
        return typeof formula === 'string'
          ? `<span class="source-math">${escapeHtml(formula)}</span>`
          : token;
      }
    );
  }

  function renderFence(line, openingMatch = null) {
    if (!openingMatch) {
      const closing = line.text.match(/^( {0,3})(`{3,}|~{3,})([ \t]*)$/);
      if (!closing) return escapeHtml(line.text + line.eol);
      return `${escapeHtml(closing[1])}<span class="source-fence-marker">${escapeHtml(
        closing[2]
      )}</span>${escapeHtml(closing[3] + line.eol)}`;
    }

    const [, indentation, marker, info] = openingMatch;
    return `${escapeHtml(indentation)}<span class="source-fence-marker">${escapeHtml(
      marker
    )}</span><span class="source-fence-language">${escapeHtml(info)}</span>${escapeHtml(line.eol)}`;
  }

  function highlight(source, highlighter, mathProtector) {
    const value = typeof source === 'string' ? source : String(source ?? '');
    if (!value) return '';
    if (value.length > MAX_HIGHLIGHT_LENGTH) return escapeHtml(value);

    const lines = sourceLines(value);
    if (!lines.length) return escapeHtml(value);

    let output = '';
    let plainStart = 0;
    let lineIndex = 0;

    while (lineIndex < lines.length) {
      const openingLine = lines[lineIndex];
      const opening = openingLine.text.match(/^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/);
      if (!opening || (opening[2][0] === '`' && opening[3].includes('`'))) {
        lineIndex += 1;
        continue;
      }

      output += highlightMarkdown(
        highlighter,
        value.slice(plainStart, openingLine.start),
        mathProtector
      );
      output += renderFence(openingLine, opening);

      const markerCharacter = opening[2][0];
      const minimumLength = opening[2].length;
      let closingIndex = lineIndex + 1;
      for (; closingIndex < lines.length; closingIndex += 1) {
        const closing = lines[closingIndex].text.match(/^( {0,3})(`{3,}|~{3,})([ \t]*)$/);
        if (
          closing &&
          closing[2][0] === markerCharacter &&
          closing[2].length >= minimumLength
        ) {
          break;
        }
      }

      const codeStart = openingLine.end;
      const hasClosingFence = closingIndex < lines.length;
      const codeEnd = hasClosingFence ? lines[closingIndex].start : value.length;
      const language = languageFromInfo(opening[3]);
      output += highlightWith(highlighter, value.slice(codeStart, codeEnd), language);

      if (!hasClosingFence) {
        plainStart = value.length;
        lineIndex = lines.length;
        break;
      }

      output += renderFence(lines[closingIndex]);
      plainStart = lines[closingIndex].end;
      lineIndex = closingIndex + 1;
    }

    output += highlightMarkdown(highlighter, value.slice(plainStart), mathProtector);
    return output;
  }

  return { escapeHtml, highlight, languageFromInfo };
});
