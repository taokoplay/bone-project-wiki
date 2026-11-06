import { lexer } from './marked.mjs';

export const safeImage = value => typeof value === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(value);

// Decode character references only. Source markup is never parsed as panel HTML.
function entities(text) {
  const decoder = document.createElement('textarea');
  return String(text || '').replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, entity => {
    decoder.innerHTML = entity;
    return decoder.value;
  });
}
function linkTarget(value) {
  const href = entities(value).trim();
  if (/[\u0000-\u0020\u007f]/.test(href)) return null;
  if (href.startsWith('#')) return href;
  if (!/^(?:https?:\/\/|mailto:)/i.test(href)) return null;
  try {
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
const node = (tag, text) => {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  return result;
};

function inline(tokens, target) {
  for (const token of tokens || []) {
    switch (token.type) {
      case 'strong': case 'em': case 'del': {
        const child = node(token.type);
        inline(token.tokens, child); target.append(child); break;
      }
      case 'codespan': target.append(node('code', token.text)); break;
      case 'br': target.append(node('br')); break;
      case 'link': {
        const href = linkTarget(token.href);
        const child = node(href ? 'a' : 'span');
        if (href) {
          child.setAttribute('href', href);
          if (!href.startsWith('#')) { child.target = '_blank'; child.rel = 'noopener noreferrer'; }
          if (token.title) child.title = entities(token.title);
        }
        inline(token.tokens, child); target.append(child); break;
      }
      case 'image': {
        if (safeImage(token.href)) {
          const image = node('img'); image.src = token.href;
          image.alt = entities(token.text); target.append(image);
        } else {
          // Local/remote image URLs are inert: no implicit file or network access.
          const label = node('span', entities(token.text || token.href));
          label.className = 'markdown-image'; label.title = entities(token.href);
          target.append(label);
        }
        break;
      }
      case 'html': case 'escape': target.append(document.createTextNode(token.text)); break;
      default:
        if (token.tokens) inline(token.tokens, target);
        else target.append(document.createTextNode(entities(token.text ?? token.raw)));
    }
  }
}
function blocks(tokens, target, loose = true) {
  for (const token of tokens) {
    switch (token.type) {
      case 'space': case 'def': break;
      case 'heading': {
        const heading = node(`h${Math.max(1, Math.min(6, token.depth))}`);
        inline(token.tokens, heading); target.append(heading); break;
      }
      case 'paragraph': case 'text': {
        const paragraph = token.type === 'paragraph' || loose ? node('p') : document.createDocumentFragment();
        if (token.tokens) inline(token.tokens, paragraph);
        else paragraph.append(document.createTextNode(entities(token.text)));
        target.append(paragraph); break;
      }
      case 'code': {
        const pre = node('pre'), code = node('code', token.text);
        if (token.lang) code.dataset.language = token.lang.split(/\s+/)[0];
        pre.tabIndex = 0; pre.append(code); target.append(pre); break;
      }
      case 'blockquote': {
        const quote = node('blockquote'); blocks(token.tokens, quote);
        target.append(quote); break;
      }
      case 'list': {
        const list = node(token.ordered ? 'ol' : 'ul');
        if (token.ordered && token.start !== 1) list.start = token.start;
        for (const item of token.items) {
          const li = node('li');
          if (item.task) {
            li.className = 'task-item';
            const check = node('input'); check.type = 'checkbox';
            check.disabled = true; check.checked = item.checked;
            li.append(check, document.createTextNode(' '));
          }
          blocks(item.tokens, li, token.loose); list.append(li);
        }
        target.append(list); break;
      }
      case 'table': {
        const wrap = node('div'); wrap.className = 'markdown-table'; wrap.tabIndex = 0;
        const table = node('table'), head = node('thead'), body = node('tbody');
        const row = (cells, header) => {
          const tr = node('tr');
          cells.forEach((cell, index) => {
            const td = node(header ? 'th' : 'td');
            if (header) td.scope = 'col';
            if (['left', 'center', 'right'].includes(token.align[index])) td.style.textAlign = token.align[index];
            inline(cell.tokens, td); tr.append(td);
          });
          return tr;
        };
        head.append(row(token.header, true));
        token.rows.forEach(cells => body.append(row(cells, false)));
        table.append(head, body); wrap.append(table); target.append(wrap); break;
      }
      case 'hr': target.append(node('hr')); break;
      case 'html': {
        const literal = node('pre', token.text); literal.className = 'markdown-literal';
        target.append(literal); break;
      }
      default: target.append(node('p', token.raw || token.text || ''));
    }
  }
}

export function markdown(content) {
  const fragment = document.createDocumentFragment();
  blocks(lexer(String(content || ''), { gfm: true, breaks: false }), fragment);
  return fragment;
}
