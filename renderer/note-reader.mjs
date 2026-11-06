import { markdown } from './markdown.mjs';
import { linkedDocumentCard } from './document-memory.mjs';

const node = (tag, text, className) => {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
};
const action = (text, onClick) => {
  const button = node('button', text); button.type = 'button';
  button.dataset.mutation = ''; button.addEventListener('click', onClick);
  return button;
};

export function noteReader(entry, t, { onEdit, onOpenSource, onForget }) {
  const reader = node('section', undefined, 'note-reader');
  const bar = node('div', undefined, 'note-mode-bar');
  bar.append(node('span', t('readOnly'), 'note-mode-label'));
  if (!entry.documentRef) bar.append(action(t('edit'), onEdit));
  reader.append(bar, node('h1', entry.title, 'note-heading'));
  if (entry.documentRef) reader.append(linkedDocumentCard(entry, t, onOpenSource));
  if (!entry.documentRef || entry.documentLink?.state === 'current') {
    const article = node('article', undefined, 'article');
    article.setAttribute('aria-label', t('content'));
    if (entry.content) {
      try { article.append(markdown(entry.content)); }
      catch (error) {
        console.error('Markdown rendering failed', error);
        article.append(node('p', t('markdownUnavailable'), 'hint'), node('pre', entry.content));
      }
    } else article.append(node('p', t('emptyDocument'), 'hint'));
    reader.append(article);
  }
  if (entry.kind === 'memory') {
    const bar = node('div', undefined, 'memory-bar');
    bar.append(action(t('forget'), onForget)); reader.append(bar);
  }
  return reader;
}
