'use strict';
const { relative, validateFiles, KNOWLEDGE_ROOT } = require('./core.cjs');
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 100;
const HTML = /\.html?$/i;
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const RESOURCE = /\.(css|m?js|png|jpe?g|webp|gif)$/i;
const changedWorkspace = error => /WORKSPACE_CHANGED|PLUGIN_UNLOADED|LOCAL_PROJECT_REQUIRED/.test(String(error?.message || error));
const limit = () => { throw new Error('HTML_PREVIEW_LIMIT'); };

function localPath(base, ref) {
  if (typeof ref !== 'string' || !ref.trim() || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(ref.trim())) return null;
  let value;
  try { value = decodeURIComponent(ref.trim().replace(/&amp;/gi, '&').split(/[?#]/)[0]); } catch { return null; }
  if (/[\\:\x00-\x1f\x7f]/.test(value) || value.startsWith('/')) return null;
  const parts = base.split('/').slice(0, -1);
  for (const piece of value.split('/')) {
    if (piece === '..') { if (!parts.length) return null; parts.pop(); }
    else if (piece && piece !== '.') { if (piece.startsWith('.')) return null; parts.push(piece); }
  }
  const name = parts.join('/');
  try { relative(name); return RESOURCE.test(name) ? name : null; } catch { return null; }
}

function references(file) {
  const result = [];
  const content = file.content || '';
  if (HTML.test(file.path)) {
    // Discovery is conservative; DOM parsing and CSP remain the renderer's authority.
    const inert = content.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi, '<script $1></script>');
    for (const tag of inert.matchAll(/<(?:script|link|img)\b[^>]*>/gi)) {
      for (const match of tag[0].matchAll(/\s(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) result.push(match[1] ?? match[2] ?? match[3]);
    }
    for (const style of inert.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) result.push(...cssReferences(style[1]));
    for (const style of inert.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) result.push(...cssReferences(style[1] ?? style[2]));
  } else if (/\.css$/i.test(file.path)) result.push(...cssReferences(content));
  return [...new Set(result.map(ref => localPath(file.path, ref)).filter(Boolean))];
}
function cssReferences(content) {
  return [...content.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)].map(match => match[1] ?? match[2] ?? match[3]);
}

class HtmlPreviews {
  constructor(service) { this.service = service; }
  async attach(entry, workspacePath) {
    if (entry.kind !== 'attachment') return entry;
    const rawHtml = HTML.test(entry.path || '');
    const pages = (entry.files || []).filter(file => HTML.test(file.path) && typeof file.content === 'string');
    if (!rawHtml && !pages.length) return entry;
    try {
      if (!rawHtml) {
        const root = pages.find(file => /(^|\/)index\.html?$/i.test(file.path)) || pages[0];
        return { ...entry, htmlPreview: { entryPath: root.path, files: validateFiles(entry.files, 'prototype', root.path), missing: [] } };
      }
      relative(entry.path);
      if (!entry.path.startsWith(`${KNOWLEDGE_ROOT}/`)) throw new Error('UNSAFE_HTML_PREVIEW');
      const directory = entry.path.slice(0, entry.path.lastIndexOf('/'));
      const entryPath = entry.path.split('/').at(-1);
      const files = []; const missing = []; const seen = new Set([entryPath]);
      const pending = [entryPath]; let bytes = 0;
      while (pending.length) {
        const name = pending.shift();
        const filename = `${directory}/${name}`;
        relative(filename);
        let file;
        try {
          await this.service.workspace(workspacePath);
          const info = await this.service.pi.fs.stat(filename);
          await this.service.workspace(workspacePath);
          if (!Number.isSafeInteger(info.size) || info.size < 0 || bytes + info.size > MAX_BYTES) limit();
          if (IMAGE.test(name)) {
            if (typeof this.service.pi.fs.readPreview !== 'function') throw new Error('PREVIEW_READER_UNAVAILABLE');
            const preview = await this.service.pi.fs.readPreview(filename);
            await this.service.workspace(workspacePath);
            const dataUrl = typeof preview === 'string' ? preview : preview?.dataUrl;
            if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i.test(dataUrl)) throw new Error('INVALID_PREVIEW_IMAGE');
            bytes += Buffer.byteLength(dataUrl.split(',')[1], 'base64');
            file = { path: name, dataUrl };
          } else {
            const content = await this.service.readFile(filename, workspacePath);
            if (typeof content !== 'string' || content.includes('\0')) throw new Error('INVALID_HTML_SOURCE');
            bytes += Buffer.byteLength(content);
            file = { path: name, content };
          }
          if (bytes > MAX_BYTES) limit();
        } catch (error) {
          if (changedWorkspace(error) || error.message === 'HTML_PREVIEW_LIMIT' || name === entryPath) throw error;
          missing.push(name); continue;
        }
        files.push(file);
        for (const ref of references(file)) {
          if (seen.has(ref)) continue;
          if (seen.size >= MAX_FILES) limit();
          seen.add(ref); pending.push(ref);
        }
      }
      return { ...entry, htmlPreview: { entryPath, files, missing } };
    } catch (error) {
      if (changedWorkspace(error)) throw error;
      return { ...entry, htmlPreview: { error: /HTML_PREVIEW_LIMIT|BUNDLE_TOO_LARGE/.test(error.message) ? 'HTML_PREVIEW_LIMIT' : 'HTML_PREVIEW_UNAVAILABLE' } };
    }
  }
}
module.exports = { HtmlPreviews };
