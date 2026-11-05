import { buildPrototype } from './content.mjs';

export function htmlPreview(preview, title, t) {
  const section = document.createElement('section');
  section.className = 'html-preview';
  section.setAttribute('aria-label', t('htmlPreview'));
  const notice = (text, error = false) => {
    const message = document.createElement('p');
    message.className = error ? 'hint preview-error' : 'hint';
    if (error) message.setAttribute('role', 'alert');
    message.textContent = text; section.append(message);
  };
  if (preview.error) {
    notice(t(preview.error === 'HTML_PREVIEW_LIMIT' ? 'htmlPreviewLimit' : 'htmlPreviewUnavailable'), true);
    return section;
  }
  notice(t('limitations'));
  if (preview.missing?.length) notice(`${t('htmlPreviewMissing')} ${preview.missing.join(', ')}`);
  try {
    const frame = document.createElement('iframe');
    frame.className = 'preview'; frame.title = title;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.srcdoc = buildPrototype(preview);
    section.append(frame);
  } catch (error) { notice(error.message, true); }
  return section;
}
