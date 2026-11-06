import { memoryFields } from './memory-fields.mjs';
// Document-owned rules and memory summaries have separate editing surfaces.
// All dynamic text uses textContent; host requests stay in the panel controller.
const node = (tag, text, className) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
};
export function linkedDocumentCard(entry, t, onOpen) {
  const card = node('section', undefined, 'document-memory-card');
  const link = entry.documentLink || { state: 'unreadable', readWhen: entry.documentRef.readWhen };
  card.setAttribute('aria-label', t('linkedDocument'));
  card.append(node('h3', t('linkedDocument')), node('p', t(`link_${link.state}`), 'hint'));
  if (link.readWhen) card.append(node('p', `${t('readWhen')}: ${link.readWhen}`, 'hint'));
  const open = node('button', t('readOriginal'), 'read-original');
  open.type = 'button'; open.disabled = !link.document || ['missing', 'unreadable', 'ambiguous'].includes(link.state);
  open.addEventListener('click', () => onOpen(link.document.recordId));
  card.append(open);
  return card;
}
export function rememberDocumentForm(entry, t, { draft, policy, onDraftChange, onRemember }) {
  const disclosure = node('details', undefined, 'document-memory-editor');
  disclosure.open = Boolean(draft);
  disclosure.append(node('summary', t('rememberDocument')));
  disclosure.append(node('p', t('rememberDocumentHelp'), 'hint'));
  const form = node('form', undefined, 'document-memory-form');
  const summaryLabel = node('label', undefined, 'field');
  summaryLabel.append(node('span', t('memorySummary')));
  const summary = node('textarea'); summary.name = 'memorySummary'; summary.maxLength = 800; summary.required = true;
  summary.value = draft?.summary || ''; summaryLabel.append(summary);
  const whenLabel = node('label', undefined, 'field');
  whenLabel.append(node('span', t('readWhen')));
  const when = node('input'); when.name = 'readWhen'; when.maxLength = 240; when.required = true;
  when.value = draft?.readWhen || ''; whenLabel.append(when);
  const settings = memoryFields(t, draft || policy);
  const confirmLabel = node('label', undefined, 'memory-confirm');
  const confirm = node('input'); confirm.type = 'checkbox'; confirm.name = 'confirmDocument'; confirm.required = true;
  confirmLabel.append(confirm, node('span', t('confirmDocument')));
  const save = node('button', t('confirmAndRemember'), 'primary'); save.type = 'submit'; save.dataset.mutation = '';
  if (entry.status === 'archived') save.disabled = true;
  form.append(summaryLabel, whenLabel, settings.element, confirmLabel, save);
  form.addEventListener('input', () => onDraftChange({ summary: summary.value, readWhen: when.value, ...settings.read() }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    onRemember({ summary: summary.value.trim(), readWhen: when.value.trim(), ...settings.read() });
  });
  disclosure.append(form);
  return disclosure;
}
