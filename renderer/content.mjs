import { t } from './i18n.mjs';

import { safeImage } from './markdown.mjs';
export { safeImage, markdown } from './markdown.mjs';

function resolvePath(base, ref) {
  if (!ref || /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i.test(ref)) return null;
  let decoded;
  try { decoded = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { return null; }
  const parts = base.split('/').slice(0, -1);
  for (const piece of decoded.replaceAll('\\', '/').split('/')) {
    if (piece === '..') { if (!parts.length) return null; parts.pop(); }
    else if (piece && piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

export function buildPrototype(entry) {
  const files = new Map((entry.files || []).map(file => [file.path, file]));
  const root = files.get(entry.entryPath);
  if (!root || typeof root.content !== 'string') throw new Error(t('noHtml'));
  const find = (base, ref) => files.get(resolvePath(base, ref));
  const image = (base, ref) => safeImage(ref) ? ref : (safeImage(find(base, ref)?.dataUrl) ? find(base, ref).dataUrl : '');
  const css = (text, base) => text
    .replace(/@import\s+(?:url\([^)]*\)|[^;]+);?/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_, quote, ref) => `url("${image(base, ref.trim())}")`);
  const doc = new DOMParser().parseFromString(root.content, 'text/html');
  // Parse inertly; imported markup never enters the panel document.
  doc.querySelectorAll('base,meta,iframe,frame,frameset,object,embed,portal,svg,math').forEach(node => node.remove());
  for (const link of doc.querySelectorAll('link')) {
    const file = find(entry.entryPath, link.getAttribute('href'));
    if (link.rel === 'stylesheet' && typeof file?.content === 'string') {
      const style = doc.createElement('style');
      style.textContent = css(file.content, file.path);
      link.replaceWith(style);
    } else link.remove();
  }
  for (const script of doc.querySelectorAll('script')) {
    if (script.type === 'module' || script.type === 'importmap') { script.remove(); continue; }
    if (script.hasAttribute('src')) {
      const file = find(entry.entryPath, script.getAttribute('src'));
      if (typeof file?.content !== 'string') { script.remove(); continue; }
      script.removeAttribute('src');
      script.textContent = file.content;
    }
    // Prevent imported source from terminating its element when serialized.
    script.textContent = script.textContent.replace(/<\/script/gi, '<\\/script');
    script.removeAttribute('integrity');
  }
  for (const node of doc.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      if (['srcset', 'action', 'formaction', 'target', 'ping', 'srcdoc', 'background', 'poster', 'xlink:href', 'data', 'codebase'].includes(name)) node.removeAttribute(attribute.name);
      if (name === 'src') {
        const value = node.tagName === 'IMG' ? image(entry.entryPath, attribute.value) : '';
        if (value) node.setAttribute('src', value); else node.removeAttribute('src');
      }
      if (name === 'href' && !attribute.value.startsWith('#')) node.removeAttribute(attribute.name);
    }
    if (node.hasAttribute('style')) node.setAttribute('style', css(node.getAttribute('style'), entry.entryPath));
  }
  // Newly inlined linked styles have already resolved relative paths.
  for (const style of doc.querySelectorAll('style')) style.textContent = css(style.textContent, entry.entryPath).replace(/<\/style/gi, '<\\/style');
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
  doc.head.prepend(policy);
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}


export async function collectFiles(input) {
  const files = [...input];
  if (!files.length) throw new Error(t('noFiles'));
  if (files.length > 100 || files.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) throw new Error(t('limit'));
  const seen = new Set();
  const result = [];
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    if (seen.has(path)) throw new Error(`${t('duplicate')}: ${path}`);
    seen.add(path);
    if (/\.(png|jpe?g|webp|gif)$/i.test(path)) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`${t('error')}: ${path}`));
        reader.onload = () => resolve(reader.result);
        const extension = path.split('.').at(-1).toLowerCase();
        reader.readAsDataURL(new Blob([file], { type: `image/${extension === 'jpg' ? 'jpeg' : extension}` }));
      });
      result.push({ path, dataUrl });
    } else if (/\.(html?|css|m?js|txt|md|json|csv)$/i.test(path)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let content;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error(`${t('unsupported')}: ${path}`); }
      if (content.includes('\0')) throw new Error(`${t('unsupported')}: ${path}`);
      result.push({ path, content });
    } else throw new Error(`${t('unsupported')}: ${path}`);
  }
  return result;
}
