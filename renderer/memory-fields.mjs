const node = (tag, text, className) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
};

// Editing controls only; the service validates all project-relative scope paths.
export function memoryFields(t, values = {}, { confirmation = false } = {}) {
  const element = node('details', undefined, 'memory-policy-editor');
  element.append(node('summary', t('memorySettings')));
  const scopeLabel = node('label', undefined, 'field');
  scopeLabel.append(node('span', t('memoryScope')));
  const scope = node('input'); scope.name = 'scopePaths'; scope.type = 'text';
  scope.value = (values.scopePaths || []).join(', '); scope.placeholder = t('memoryScopePlaceholder');
  scopeLabel.append(scope, node('span', t('memoryScopeHelp'), 'hint'));
  const coreLabel = node('label', undefined, 'memory-confirm');
  const core = node('input'); core.type = 'checkbox'; core.name = 'coreMemory'; core.checked = values.importance === 'core';
  coreLabel.append(core, node('span', t('coreMemory')));
  element.append(scopeLabel, coreLabel);
  let confirmed;
  if (confirmation) {
    const label = node('label', undefined, 'memory-confirm');
    confirmed = node('input'); confirmed.type = 'checkbox'; confirmed.name = 'confirmMemory'; confirmed.checked = values.status === 'confirmed';
    label.append(confirmed, node('span', t('confirmMemory')));
    element.append(label, node('p', t('candidateMemoryHelp'), 'hint'));
  }
  return {
    element,
    read: () => ({
      scopePaths: scope.value.split(/[,\n，]/).map(value => value.trim()).filter(Boolean),
      importance: core.checked ? 'core' : 'normal',
      ...(confirmed ? { status: confirmed.checked ? 'confirmed' : values.status === 'archived' ? 'archived' : 'draft' } : {}),
    }),
  };
}
