import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { classifySource, imageType, importImages, ImageResources, download, MAX_IMAGE_SIZE } = require('../src/images');
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#16816e"/></svg>');

test('image sources resolve against the document and preserve encoded special characters', () => {
  assert.equal(classifySource('/docs/实验/a.md', '../图 片/a%23b%28c%29.svg', 'darwin').value, '/docs/图 片/a#b(c).svg');
  assert.equal(classifySource('/docs/a.md', 'file:///tmp/%E5%9B%BE.svg', 'darwin').value, '/tmp/图.svg');
  assert.equal(classifySource('C:\\docs\\a.md', '..\\images\\a.png', 'win32').value, 'C:\\images\\a.png');
  assert.equal(classifySource('C:\\docs\\a.md', 'file:///D:/images/a%20b.png', 'win32').value, 'D:\\images\\a b.png');
  assert.equal(classifySource('C:\\docs\\a.md', 'C:%5Cimages%5Ca.png', 'win32').value, 'C:\\images\\a.png');
  assert.throws(() => classifySource('/docs/a.md', 'javascript:alert(1)'));
  assert.throws(() => classifySource('/docs/a.md', 'https://user:pass@example.com/a.png'));
  assert.throws(() => classifySource('C:\\a.md', '\\\\server\\share\\a.png', 'win32'));
});

test('image type checks use bytes and reject oversized or active SVG content', () => {
  assert.equal(imageType(svg).mime, 'image/svg+xml');
  assert.throws(() => imageType(Buffer.from('<html>bad</html>')));
  assert.throws(() => imageType(Buffer.from('<svg><script>alert(1)</script></svg>')));
  assert.throws(() => imageType(Buffer.alloc(MAX_IMAGE_SIZE + 1)));
});

test('imports create portable references, reuse identical files and do not overwrite originals', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'formula-images-'));
  try {
    const document = path.join(directory, '实验 (1).md');
    await fs.writeFile(document, '# test');
    const items = [{ name: '图 [1].svg', bytes: svg }];
    const first = (await importImages(document, items))[0];
    const second = (await importImages(document, items))[0];
    assert.equal(first.path, second.path);
    assert.match(first.markdown, /实验|%E5%AE%9E/);
    assert.match(first.markdown, /\.assets\//);
    assert.equal((await fs.readFile(first.path)).toString(), svg.toString());
    assert.equal((await fs.readdir(path.dirname(first.path))).length, 1);
    assert.equal((await importImages(document, [{ name: 'bad.jpg', bytes: Buffer.from('not an image') }]))[0].error.includes('受支持'), true);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('closed documents revoke resource access and remote images default to zero requests', async () => {
  let requests = 0;
  const resources = new ImageResources({ fetcher: async () => { requests++; return new Response(svg, { headers: { 'content-type': 'image/svg+xml' } }); } });
  resources.open('/docs/a.md');
  assert.equal(resources.prepare('/docs/a.md', ['https://example.com/a.svg'])[0].remote, true);
  assert.equal(requests, 0);
  const prepared = resources.prepare('/docs/a.md', [`data:image/svg+xml;base64,${svg.toString('base64')}`])[0];
  const id = prepared.url.split('/').pop();
  assert.equal((await resources.load(id)).mime, 'image/svg+xml');
  resources.close('/docs/a.md');
  await assert.rejects(resources.load(id), /失效/);
  assert.throws(() => resources.prepare('/docs/a.md', []), /关闭/);
});

test('remote loader limits redirects and omits credentials', async () => {
  let requests = 0;
  const bytes = await download('https://example.com/a', new AbortController().signal, async (_url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(Object.keys(options.headers), ['Accept']);
    requests++;
    return requests < 3 ? new Response(null, { status: 302, headers: { location: '/next' } }) : new Response(svg, { headers: { 'content-type': 'image/svg+xml' } });
  });
  assert.equal(bytes.toString(), svg.toString());
  await assert.rejects(download('https://example.com/a', new AbortController().signal, async () => new Response(null, { status: 302, headers: { location: '/loop' } })), /重定向/);
  await assert.rejects(download('https://example.com/a', new AbortController().signal, async () => new Response(svg, { headers: { 'content-type': 'text/html' } })), /不是图片/);
});

test('turning remote access off cancels an in-flight request; timeouts settle', async () => {
  let allowed = true;
  const fetcher = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const resources = new ImageResources({ allowRemote: () => allowed, fetcher, timeout: 30 });
  resources.open('/docs/a.md');
  let item = resources.prepare('/docs/a.md', ['https://example.com/a.svg'])[0];
  let pending = resources.load(item.url.split('/').pop());
  allowed = false;
  resources.disableRemote();
  await assert.rejects(pending, /取消/);
  allowed = true;
  item = resources.prepare('/docs/a.md', ['https://example.com/a.svg'])[0];
  await assert.rejects(resources.load(item.url.split('/').pop()), /超时/);
  resources.closeAll();
});
