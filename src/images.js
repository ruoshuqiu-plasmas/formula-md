const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { createHash, randomUUID } = require('node:crypto');
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'];

function classifySource(documentPath, source, platform = process.platform) {
  if (typeof source !== 'string' || !source.trim() || source.length > MAX_IMAGE_SIZE * 1.4) throw new Error('图片地址无效。');
  const value = source.trim();
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.username || url.password) throw new Error('图片地址不能包含登录信息。');
    return { type: 'remote', value: url.href };
  }
  if (/^data:/i.test(value)) return { type: 'data', value };
  if (/^file:/i.test(value)) {
    const url = new URL(value);
    if (url.hostname && url.hostname !== 'localhost') throw new Error('不支持网络共享图片路径。');
    if (platform === 'win32') return { type: 'local', value: decodeURIComponent(url.pathname).replace(/^\/([a-z]:)/i, '$1').replaceAll('/', '\\') };
    return { type: 'local', value: fileURLToPath(url, { windows: false }) };
  }
  const decoded = decodeURIComponent(value.replace(/(\.(?:png|jpe?g|gif|webp|bmp|avif|svg))[?#].*$/i, '$1'));
  if (/^[a-z][\w+.-]*:/i.test(decoded) && !/^[a-z]:[\\/]/i.test(decoded)) throw new Error('不支持此图片地址协议。');
  if (/^(\\\\|\/\/)/.test(decoded)) throw new Error('不支持网络共享图片路径。');
  const paths = platform === 'win32' ? path.win32 : path.posix;
  return { type: 'local', value: paths.resolve(paths.dirname(documentPath), decoded) };
}

function imageType(bytes) {
  if (!bytes.length || bytes.length > MAX_IMAGE_SIZE) throw new Error('图片为空或超过 20 MB。');
  const head = bytes.subarray(0, 512).toString('utf8');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', ext: 'png' };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mime: 'image/jpeg', ext: 'jpg' };
  if (/^GIF8[79]a/.test(head)) return { mime: 'image/gif', ext: 'gif' };
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (head.startsWith('BM')) return { mime: 'image/bmp', ext: 'bmp' };
  if (bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 48))) return { mime: 'image/avif', ext: 'avif' };
  if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) {
    const svg = bytes.toString('utf8');
    if (/<!DOCTYPE|<!ENTITY|<script[\s>]|<foreignObject[\s>]/i.test(svg)) throw new Error('SVG 包含不支持的活动内容。');
    return { mime: 'image/svg+xml', ext: 'svg' };
  }
  throw new Error('不是受支持的图片文件。');
}

function imageErrorMessage(error) {
  if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return '找不到图片文件，请检查路径。';
  if (error.code === 'EACCES' || error.code === 'EPERM') return '没有读取或写入此图片的权限。';
  if (error.name === 'AbortError') return '图片加载超时或已取消。';
  if (/[\u3400-\u9fff]/.test(error.message || '')) return error.message;
  return '图片加载失败，请检查文件或网络连接。';
}

async function readLocal(filePath) {
  const file = await fs.open(filePath, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_IMAGE_SIZE) throw new Error('图片不是普通文件或超过 20 MB。');
    // A bounded read also protects against a file growing after stat().
    const bytes = Buffer.alloc(Math.min(stat.size + 1, MAX_IMAGE_SIZE + 1));
    let count = 0;
    while (count < bytes.length) {
      const { bytesRead } = await file.read(bytes, count, bytes.length - count, null);
      if (!bytesRead) break;
      count += bytesRead;
    }
    return bytes.subarray(0, count);
  } finally { await file.close(); }
}

async function download(url, signal, fetcher = fetch) {
  for (let redirects = 0; redirects <= 5; redirects++) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('网络图片地址无效。');
    const response = await fetcher(parsed.href, { signal, redirect: 'manual', credentials: 'omit', headers: { Accept: 'image/*' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (redirects === 5 || !response.headers.get('location')) throw new Error('图片重定向次数过多。');
      url = new URL(response.headers.get('location'), parsed).href;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`图片下载失败 (${response.status})。`); }
    if (!/^image\//i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw new Error('网络资源不是图片。'); }
    if (Number(response.headers.get('content-length')) > MAX_IMAGE_SIZE) { await response.body?.cancel(); throw new Error('图片超过 20 MB。'); }
    const chunks = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_IMAGE_SIZE) throw new Error('图片超过 20 MB。');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks);
  }
}

function decodeData(value) {
  const match = /^data:(image\/[\w.+-]+)(;base64)?,([\s\S]*)$/i.exec(value);
  if (!match) throw new Error('内嵌图片格式无效。');
  return match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]));
}

class ImageResources {
  constructor({ allowRemote = () => false, fetcher, timeout = 15000 } = {}) {
    this.allowRemote = allowRemote;
    this.fetcher = fetcher;
    this.timeout = timeout;
    this.documents = new Map();
    this.resources = new Map();
  }
  open(documentPath) { if (!this.documents.has(documentPath)) this.documents.set(documentPath, new Map()); }
  assertOpen(documentPath) { if (!this.documents.has(documentPath)) throw new Error('文档已关闭，请重新打开。'); }
  prepare(documentPath, sources) {
    this.assertOpen(documentPath);
    if (!Array.isArray(sources) || sources.length > 1000) throw new Error('图片数量超过限制。');
    const document = this.documents.get(documentPath);
    return sources.map((source) => {
      try {
        const location = classifySource(documentPath, source);
        if (location.type === 'remote' && !this.allowRemote()) return { error: '网络图片已关闭，可在外观与图片设置中开启。', remote: true };
        const key = `${location.type}:${location.value}`;
        let id = document.get(key);
        if (!id) {
          id = randomUUID();
          document.set(key, id);
          this.resources.set(id, { documentPath, location, controller: null, pending: null, error: null });
        }
        return { url: `formula-md-image://resource/${id}`, remote: location.type === 'remote' };
      } catch (error) { return { error: error.message }; }
    });
  }
  async load(id) {
    const resource = this.resources.get(id);
    if (!resource) throw new Error('图片资源已失效。');
    if (resource.location.type === 'remote' && !this.allowRemote()) throw new Error('网络图片已关闭。');
    if (!resource.pending) {
      resource.controller = new AbortController();
      const timer = setTimeout(() => resource.controller.abort(), this.timeout);
      resource.pending = (async () => {
        const { type, value } = resource.location;
        const bytes = type === 'remote' ? await download(value, resource.controller.signal, this.fetcher)
          : type === 'data' ? decodeData(value) : await readLocal(value);
        if (!this.resources.has(id) || resource.controller.signal.aborted) throw new Error('图片加载已取消。');
        const format = imageType(bytes);
        return { bytes, ...format };
      })().catch((error) => {
        resource.error = imageErrorMessage(error);
        throw new Error(resource.error);
      }).finally(() => { clearTimeout(timer); resource.pending = null; });
    }
    return resource.pending;
  }
  error(url) { return this.resources.get(url.split('/').pop())?.error || '图片损坏、格式无效或文件不存在。'; }
  disableRemote() {
    for (const document of this.documents.values()) {
      for (const [key, id] of document) {
        const resource = this.resources.get(id);
        if (resource?.location.type === 'remote') {
          resource.controller?.abort();
          this.resources.delete(id);
          document.delete(key);
        }
      }
    }
  }
  close(documentPath) {
    const document = this.documents.get(documentPath);
    if (!document) return;
    for (const id of document.values()) { this.resources.get(id)?.controller?.abort(); this.resources.delete(id); }
    this.documents.delete(documentPath);
  }
  closeAll() { for (const key of this.documents.keys()) this.close(key); }
}

async function importImages(documentPath, items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('请选择 1–100 张图片。');
  const directory = path.join(path.dirname(documentPath), `${path.parse(documentPath).name}.assets`);
  const results = [];
  for (const item of items) {
    try {
      const bytes = item.path ? await readLocal(item.path) : Buffer.from(item.bytes || []);
      const { ext } = imageType(bytes);
      const base = path.parse(item.name || item.path || '图片').name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[.\s]+$/g, '').slice(0, 60) || '图片';
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
      const name = `${base}-${hash}.${ext}`;
      await fs.mkdir(directory, { recursive: true });
      const target = path.join(directory, name);
      try { await fs.writeFile(target, bytes, { flag: 'wx' }); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        if (!(await fs.readFile(target)).equals(bytes)) throw new Error('已有同名文件，未覆盖。');
      }
      const relative = path.relative(path.dirname(documentPath), target).split(path.sep).map(encodeURIComponent).join('/');
      const alt = base.replace(/[\[\]\\]/g, '\\$&');
      results.push({ markdown: `![${alt}](<${relative}>)`, path: target });
    } catch (error) { results.push({ error: `${item.name || '图片'}：${imageErrorMessage(error)}` }); }
  }
  return results;
}
module.exports = { MAX_IMAGE_SIZE, EXTENSIONS, classifySource, imageType, readLocal, download, decodeData, ImageResources, importImages };
