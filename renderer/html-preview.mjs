import { buildPrototype } from './content.mjs';

export function htmlPreview(preview, title, t, actions = []) {
  const section = document.createElement('section');
  section.className = 'html-preview';
  section.setAttribute('aria-label', t('htmlPreview'));
  const tools = document.createElement('details');
  tools.className = 'html-preview-tools';
  const trigger = document.createElement('summary');
  trigger.setAttribute('aria-label', t('htmlPreviewOptions'));
  trigger.title = t('htmlPreviewOptions');
  const icon = document.createElement('span');
  icon.textContent = '⋯'; icon.setAttribute('aria-hidden', 'true');
  trigger.append(icon);
  const menu = document.createElement('div'); menu.className = 'html-preview-menu';
  for (const action of actions) {
    action.addEventListener('click', () => { tools.open = false; trigger.focus(); });
    menu.append(action);
  }
  const help = document.createElement('p');
  help.className = 'hint'; help.textContent = t('limitations'); menu.append(help);
  tools.append(trigger, menu);
  tools.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !tools.open) return;
    event.preventDefault(); event.stopPropagation(); tools.open = false; trigger.focus();
  });
  section.append(tools);
  const notice = (text, error = false) => {
    const message = document.createElement('p');
    message.className = `html-preview-notice${error ? ' preview-error' : ''}`;
    if (error) message.setAttribute('role', 'alert');
    message.textContent = text; section.append(message);
  };
  if (preview.error) {
    notice(t(preview.error === 'HTML_PREVIEW_LIMIT' ? 'htmlPreviewLimit' : 'htmlPreviewUnavailable'), true);
    return section;
  }
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
