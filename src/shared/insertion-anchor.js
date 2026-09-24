(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InsertionAnchor = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function rebase(anchor, next) {
    const previous = anchor.content;
    if (previous === next || anchor.invalid) return;
    let start = 0;
    while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
    let end = previous.length;
    let newEnd = next.length;
    while (end > start && newEnd > start && previous[end - 1] === next[newEnd - 1]) { end--; newEnd--; }
    if (end <= anchor.start) { const delta = newEnd - end; anchor.start += delta; anchor.end += delta; }
    else if (start < anchor.end || (anchor.start === anchor.end && start < anchor.start && end > anchor.start)) anchor.invalid = true;
    anchor.content = next;
  }
  return { rebase };
});
