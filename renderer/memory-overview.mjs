import { createSelect } from './controls.mjs';

const node = (tag, text, className) => {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
};
const REASONS = new Set(['not_memory', 'unreadable', 'draft', 'archived', 'sensitive', 'request_only', 'empty', 'invalid_metadata', 'scope_mismatch', 'not_relevant', 'entry_limit', 'core_reserved', 'relevance_match', 'recent_fallback', 'source_current', 'source_stale', 'source_draft', 'source_archived', 'source_missing', 'source_unreadable', 'source_ambiguous', 'body_limit', 'budget_limit', 'no_read_route']);
const SOURCE_STATES = new Set(['standalone', 'current', 'stale', 'draft', 'archived', 'missing', 'unreadable', 'ambiguous']);
const readable = entry => entry && entry.status !== 'unreadable';
const factAvailable = entry => readable(entry) && entry.status === 'confirmed' && ['standalone', 'current'].includes(entry.sourceState) && entry.summaryMode === 'fact' && typeof entry.summary === 'string' && entry.summary.length <= 800;
const changed = (entry, decision) => entry.revision !== decision.revision || (entry.source?.revision || '') !== (decision.sourceRevision || '');

/** Read-only memory pane. The caller owns workspace routing and navigation. */
export function createMemoryOverview(t, { load, onOpenMemory, onOpenSource, onNew, isCurrent = () => true }) {
  const text = (key, values = {}) => t(key).replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
  const element = node('section', undefined, 'memory-overview');
  element.setAttribute('aria-label', t('memoryOverviewTitle'));
  const active = () => isCurrent() && element.isConnected;
  const button = (key, action, className = 'mo-button') => {
    const value = node('button', t(key), className);
    value.type = 'button';
    value.addEventListener('click', () => { if (active()) action(); });
    return value;
  };
  const badge = (label, tone = '') => node('span', label, `mo-badge${tone ? ` mo-${tone}` : ''}`);
  const message = (key, error = false) => {
    const value = node('p', t(key), `mo-message${error ? ' mo-error' : ''}`);
    value.setAttribute('role', error ? 'alert' : 'status');
    return value;
  };
  let overview = null, traces = null;
  let overviewState = 'loading', traceState = 'loading';
  let filter = 'all', topic = 'all';
  let refreshGeneration = 0, previewGeneration = 0;
  let previewState = 'idle', previewResult = null;

  const heading = node('div', undefined, 'mo-heading');
  const identity = node('div', undefined, 'mo-identity');
  const titleRow = node('div', undefined, 'mo-title-row');
  titleRow.append(node('h1', t('memoryOverviewTitle')), badge(t('memoryOverviewReadOnly')));
  identity.append(titleRow, node('p', t('memoryOverviewHelp'), 'mo-hint'));
  const actions = node('div', undefined, 'mo-actions');
  const refreshButton = button('memoryOverviewRefresh', () => { void refresh(); });
  const newButton = button('memoryOverviewNew', () => onNew(), 'mo-button mo-primary');
  newButton.disabled = typeof onNew !== 'function';
  actions.append(refreshButton, newButton);
  heading.append(identity, actions);
  const stats = node('dl', undefined, 'mo-stats');

  const collection = node('section', undefined, 'mo-collection');
  collection.setAttribute('aria-label', t('memoryOverviewRecords'));
  const filterBar = node('div', undefined, 'mo-filter-bar');
  const filters = node('div', undefined, 'mo-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', t('memoryOverviewFilter'));
  const filterButtons = new Map();
  for (const type of ['all', 'core', 'topic', 'ungrouped', 'candidates']) {
    const control = button(`memoryOverviewFilter_${type}`, () => { filter = type; renderCollection(); }, 'mo-filter');
    control.dataset.memoryFilter = type;
    filterButtons.set(type, control);
    filters.append(control);
  }
  const topicSelect = createSelect({
    name: 'memoryTopic', label: t('memoryOverviewTopic'), value: 'all',
    options: [{ id: 'all', label: t('memoryOverviewAllTopics') }],
    onChange: value => { topic = value; renderCollection(); },
  });
  topicSelect.element.hidden = true;
  filterBar.append(filters, topicSelect.element);
  const recordStatus = node('div', undefined, 'mo-record-status');
  const records = node('ul', undefined, 'mo-records');
  collection.append(filterBar, recordStatus, records);

  const preview = node('section', undefined, 'mo-preview');
  preview.setAttribute('aria-label', t('memoryOverviewPreviewTitle'));
  preview.append(node('h2', t('memoryOverviewPreviewTitle')), node('p', t('memoryOverviewPreviewHelp'), 'mo-hint'));
  const form = node('form', undefined, 'mo-preview-form');
  const inputField = (name, labelKey, placeholderKey) => {
    const label = node('label', undefined, 'mo-field');
    const input = node('input');
    input.type = 'text'; input.name = name;
    input.placeholder = t(placeholderKey);
    label.append(node('span', t(labelKey)), input);
    form.append(label);
    return input;
  };
  const query = inputField('memoryQuery', 'memoryOverviewQuery', 'memoryOverviewQueryPlaceholder');
  const paths = inputField('memoryPaths', 'memoryOverviewPaths', 'memoryOverviewPathsPlaceholder');
  const modeField = node('div', undefined, 'mo-field');
  const mode = createSelect({
    name: 'memoryMode', label: t('memoryOverviewPreviewMode'), value: 'automatic',
    options: ['automatic', 'manual'].map(id => ({ id, label: t(`memoryOverviewPreview_${id}`) })),
  });
  modeField.append(node('span', t('memoryOverviewPreviewMode')), mode.element);
  const submit = node('button', t('memoryOverviewRunPreview'), 'mo-button');
  submit.type = 'submit'; submit.disabled = true;
  form.append(modeField, submit);
  const previewOutput = node('div', undefined, 'mo-preview-output');
  preview.append(form, node('p', t('memoryOverviewPathsHelp'), 'mo-hint'), previewOutput);

  const preparations = node('details', undefined, 'mo-preparations');
  const preparationsTitle = node('summary', t('memoryOverviewPreparationsTitle'));
  const preparationsBody = node('div', undefined, 'mo-preparations-body');
  preparations.append(preparationsTitle, node('p', t('memoryOverviewPreparationsHelp'), 'mo-hint'), preparationsBody);
  element.append(heading, stats, collection, preview, preparations);

  function metadata(entry) {
    const list = node('dl', undefined, 'mo-metadata');
    const add = (label, value) => {
      const pair = node('div');
      pair.append(node('dt', t(label)), value);
      list.append(pair);
    };
    const scope = node('dd', undefined, 'mo-scope');
    if (entry.scopePaths?.length) for (const path of entry.scopePaths) scope.append(node('code', path));
    else scope.textContent = t('memoryOverviewProjectScope');
    add('memoryOverviewScope', scope);
    if (entry.topics?.length) add('memoryOverviewTopics', node('dd', entry.topics.join(' · ')));
    if (entry.revision != null) add('memoryOverviewVersion', node('dd', text('memoryOverviewRevision', { revision: entry.revision })));
    if (entry.source) {
      const source = node('dd', entry.source.title || t('memoryOverviewSourceDocument'));
      if (entry.source.revision != null) source.append(node('span', text('memoryOverviewRevision', { revision: entry.source.revision }), 'mo-source-version'));
      add('memoryOverviewSource', source);
    }
    return list;
  }

  function navigation(entry) {
    const links = node('div', undefined, 'mo-record-actions');
    const open = button('memoryOverviewOpenMemory', () => onOpenMemory(entry.id), 'mo-link');
    open.disabled = !readable(entry) || !entry?.id || typeof onOpenMemory !== 'function';
    links.append(open);
    if (entry?.source) {
      const source = button('memoryOverviewOpenSource', () => onOpenSource(entry.source.recordId), 'mo-link');
      source.disabled = !readable(entry) || !entry.source.recordId || ['missing', 'unreadable', 'ambiguous'].includes(entry.sourceState) || typeof onOpenSource !== 'function';
      links.append(source);
    }
    return links;
  }

  function record(entry) {
    const item = node('li', undefined, 'mo-record');
    item.dataset.memoryKey = entry.key;
    const top = node('div', undefined, 'mo-record-heading');
    const title = node('h3', readable(entry) ? entry.title || t('memoryOverviewUntitled') : t('memoryOverviewRecordUnavailable'));
    const badges = node('div', undefined, 'mo-badges');
    const status = ['confirmed', 'draft', 'archived', 'unreadable'].includes(entry.status) ? entry.status : 'unreadable';
    badges.append(badge(t(`memoryOverviewStatus_${status}`)));
    if (entry.importance === 'core') badges.append(badge(t('memoryOverviewCore')));
    const sourceState = SOURCE_STATES.has(entry.sourceState) ? entry.sourceState : 'unreadable';
    badges.append(badge(t(`memoryOverviewSource_${sourceState}`), ['standalone', 'current'].includes(sourceState) ? '' : 'attention'));
    top.append(title, badges); item.append(top);
    if (factAvailable(entry)) item.append(node('p', entry.summary, 'mo-fact'));
    else item.append(node('p', t(`memoryOverviewSummary_${entry.summaryMode === 'pointer' && readable(entry) ? 'pointer' : 'unavailable'}`), 'mo-hint'));
    if (readable(entry)) {
      item.append(metadata(entry));
      if (entry.readWhen) item.append(node('p', text('memoryOverviewReadWhen', { condition: entry.readWhen }), 'mo-read-when'));
    }
    item.append(navigation(entry));
    return item;
  }

  function renderCollection() {
    stats.replaceChildren(); records.replaceChildren(); recordStatus.replaceChildren();
    for (const [type, control] of filterButtons) {
      control.setAttribute('aria-pressed', String(filter === type));
      control.disabled = overviewState !== 'ready';
    }
    topicSelect.element.hidden = filter !== 'topic';
    topicSelect.setDisabled(overviewState !== 'ready');
    submit.disabled = overviewState !== 'ready' || previewState === 'loading';
    if (overviewState !== 'ready') {
      recordStatus.append(message(overviewState === 'loading' ? 'memoryOverviewLoading' : 'memoryOverviewLoadError', overviewState === 'error'));
      if (overviewState === 'error') recordStatus.append(button('memoryOverviewRetry', () => { void refresh(); }));
      return;
    }
    for (const key of ['total', 'confirmed', 'draft', 'archived', 'unavailable']) {
      const stat = node('div');
      stat.append(node('dt', t(`memoryOverviewCount_${key}`)), node('dd', String(overview.counts[key])));
      stats.append(stat);
    }
    const groups = overview.groups.filter(group => group.type === filter && (filter !== 'topic' || topic === 'all' || topic === group.id));
    const keys = new Set(groups.flatMap(group => group.keys));
    const entries = overview.entries.filter(entry => filter === 'all' || keys.has(entry.key));
    if (!entries.length) {
      recordStatus.append(message(overview.entries.length ? 'memoryOverviewFilterEmpty' : 'memoryOverviewEmpty'));
      return;
    }
    recordStatus.append(node('p', text('memoryOverviewShown', { count: entries.length }), 'mo-hint'));
    entries.forEach((entry, index) => {
      const item = record(entry); item.style.setProperty('--mo-index', String(Math.min(index, 5))); records.append(item);
    });
  }

  function usage(result) {
    const block = node('div', undefined, 'mo-usage');
    block.append(node('strong', text('memoryOverviewBudget', { used: result.usedChars, max: result.budget.maxChars })));
    block.append(node('span', t(result.budget.scope === 'whole_context' ? 'memoryOverviewBudgetWhole' : 'memoryOverviewBudgetBlocks')));
    block.append(node('span', text('memoryOverviewLimits', { count: result.budget.maxEntries, chars: result.budget.maxBodyChars })));
    const counts = node('div', undefined, 'mo-badges');
    for (const key of ['facts', 'pointers', 'omitted']) counts.append(badge(text(`memoryOverviewResult_${key}`, { count: result.counts[key] })));
    block.append(counts);
    return block;
  }

  function decisionRow(decision, historical) {
    const entry = overview?.entries.find(item => item.key === decision.key);
    const available = readable(entry);
    const updated = available && changed(entry, decision);
    const item = node('li', undefined, 'mo-decision');
    item.dataset.memoryKey = decision.key;
    const title = node('div', undefined, 'mo-decision-heading');
    title.append(node('strong', available ? entry.title || t('memoryOverviewUntitled') : t('memoryOverviewRemoved')));
    if (updated) title.append(badge(t('memoryOverviewUpdated'), 'attention'));
    item.append(title);
    if (updated) item.append(node('p', t('memoryOverviewUpdatedHelp'), 'mo-hint'));
    // Saved preparations never contain a fact body. Only unchanged live previews may show one.
    if (!historical && !updated && decision.presentation === 'fact' && factAvailable(entry)) item.append(node('p', entry.summary, 'mo-fact'));
    const reasons = node('ul', undefined, 'mo-reasons');
    for (const reason of decision.reasons || []) reasons.append(node('li', t(REASONS.has(reason) ? `memoryReason_${reason}` : 'memoryOverviewReasonUnavailable')));
    if (reasons.childElementCount) item.append(reasons);
    if (available) {
      const state = SOURCE_STATES.has(entry.sourceState) ? entry.sourceState : 'unreadable';
      item.append(node('p', `${text('memoryOverviewRevision', { revision: entry.revision })} · ${t(`memoryOverviewSource_${state}`)}`, 'mo-hint'));
      item.append(navigation(entry));
    }
    return item;
  }

  function decisionGroups(result, historical) {
    const container = node('div', undefined, 'mo-decision-groups');
    for (const presentation of ['fact', 'pointer', 'omitted']) {
      const decisions = result.decisions.filter(decision => decision.presentation === presentation);
      if (!decisions.length) continue;
      const group = node(presentation === 'omitted' ? 'details' : 'section', undefined, 'mo-decision-group');
      group.append(node(presentation === 'omitted' ? 'summary' : 'h3', text(`memoryOverviewDecisions_${presentation}`, { count: decisions.length })));
      const list = node('ul', undefined, 'mo-decisions');
      [...decisions].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)).forEach(decision => list.append(decisionRow(decision, historical)));
      group.append(list); container.append(group);
    }
    return container;
  }

  function renderPreview() {
    previewOutput.replaceChildren();
    previewOutput.setAttribute('aria-busy', String(previewState === 'loading'));
    submit.disabled = overviewState !== 'ready' || previewState === 'loading';
    submit.textContent = t(previewState === 'loading' ? 'memoryOverviewPreviewLoading' : 'memoryOverviewRunPreview');
    if (previewState !== 'ready') {
      const key = { idle: 'memoryOverviewPreviewEmpty', loading: 'memoryOverviewPreviewLoading', changed: 'memoryOverviewPreviewChanged', refreshed: 'memoryOverviewPreviewRefreshed', error: 'memoryOverviewPreviewError' }[previewState];
      previewOutput.append(message(key, previewState === 'error'));
      return;
    }
    previewOutput.append(message('memoryOverviewPreviewReady'), usage(previewResult), decisionGroups(previewResult, false));
    if (!previewResult.counts.selected) previewOutput.append(message('memoryOverviewNoSelection'));
  }

  function renderTraces() {
    preparationsBody.replaceChildren();
    preparationsBody.setAttribute('aria-busy', String(traceState === 'loading'));
    if (traceState !== 'ready') {
      preparationsBody.append(message(traceState === 'loading' ? 'memoryOverviewTracesLoading' : 'memoryOverviewTracesError', traceState === 'error'));
      if (traceState === 'error') preparationsBody.append(button('memoryOverviewRetry', () => { void refresh(); }));
      return;
    }
    if (traces.warnings.length) preparationsBody.append(message('memoryOverviewTracesWarning'));
    if (!traces.traces.length) preparationsBody.append(message('memoryOverviewTracesEmpty'));
    for (const trace of traces.traces) {
      const disclosure = node('details', undefined, 'mo-trace');
      const summary = node('summary');
      const time = node('time');
      const date = new Date(trace.preparedAt);
      time.textContent = Number.isNaN(date.getTime()) ? t('memoryOverviewTimeUnavailable') : new Intl.DateTimeFormat(document.documentElement.lang || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
      summary.append(node('span', t('memoryOverviewPrepared')), time);
      disclosure.append(summary, usage(trace));
      if (overviewState !== 'ready') disclosure.append(message('memoryOverviewTraceNeedsOverview'));
      else disclosure.append(decisionGroups(trace, true));
      if (trace.detailsOmitted) disclosure.append(message('memoryOverviewTraceDetailsOmitted'));
      preparationsBody.append(disclosure);
    }
  }

  function invalidatePreview(state) {
    previewGeneration += 1;
    previewResult = null;
    previewState = state;
    renderPreview();
  }
  form.addEventListener('input', () => invalidatePreview('changed'));
  form.addEventListener('submit', event => { event.preventDefault(); if (active() && overviewState === 'ready') void runPreview(); });

  async function runPreview() {
    const generation = ++previewGeneration;
    const overviewGeneration = refreshGeneration;
    previewResult = null; previewState = 'loading'; renderPreview();
    const payload = { query: query.value.trim(), paths: paths.value.split(/[,，\n]/).map(value => value.trim()).filter(Boolean), explain: true, memoryMode: mode.value };
    try {
      const result = await load('context', payload);
      if (!active() || generation !== previewGeneration || overviewGeneration !== refreshGeneration) return;
      if (result?.explanation?.schemaVersion !== 1 || result.explanation.selectionVersion !== 1 || !Array.isArray(result.explanation.decisions) || !result.explanation.budget || !result.explanation.counts) throw new Error('MEMORY_EXPLANATION_UNAVAILABLE');
      previewResult = result.explanation; previewState = 'ready';
    } catch {
      if (!active() || generation !== previewGeneration || overviewGeneration !== refreshGeneration) return;
      previewState = 'error';
    }
    renderPreview();
  }

  async function refresh() {
    const generation = ++refreshGeneration;
    const hadPreview = previewState !== 'idle';
    overview = null; traces = null; overviewState = 'loading'; traceState = 'loading';
    invalidatePreview(hadPreview ? 'refreshed' : 'idle');
    refreshButton.textContent = t('memoryOverviewRefreshing');
    element.setAttribute('aria-busy', 'true');
    renderCollection(); renderTraces();
    const overviewRequest = (async () => {
      try {
        const result = await load('memoryOverview', {});
        if (!active() || generation !== refreshGeneration) return;
        if (result?.schemaVersion !== 1 || !Array.isArray(result.entries) || !Array.isArray(result.groups) || !result.counts) throw new Error('MEMORY_OVERVIEW_UNAVAILABLE');
        overview = result; overviewState = 'ready';
        topicSelect.setOptions([{ id: 'all', label: t('memoryOverviewAllTopics') }, ...result.groups.filter(group => group.type === 'topic').map(group => ({ id: group.id, label: group.topic }))], topic);
      } catch {
        if (!active() || generation !== refreshGeneration) return;
        overviewState = 'error';
      }
      renderCollection(); renderPreview(); renderTraces();
    })();
    const tracesRequest = (async () => {
      try {
        const result = await load('memoryTraces', {});
        if (!active() || generation !== refreshGeneration) return;
        if (result?.schemaVersion !== 1 || !Array.isArray(result.traces) || !Array.isArray(result.warnings)) throw new Error('MEMORY_TRACES_UNAVAILABLE');
        traces = result; traceState = 'ready';
      } catch {
        if (!active() || generation !== refreshGeneration) return;
        traceState = 'error';
      }
      renderTraces();
    })();
    await Promise.all([overviewRequest, tracesRequest]);
    if (!active() || generation !== refreshGeneration) return;
    refreshButton.textContent = t('memoryOverviewRefresh');
    element.setAttribute('aria-busy', 'false');
  }

  void refresh();
  return { element, refresh };
}
