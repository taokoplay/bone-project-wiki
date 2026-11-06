'use strict';
const { ROOT, KNOWLEDGE_ROOT, MEMORY_ROOT, DEVELOPMENT_ROOT, SECTIONS, isKnowledgeCategory, hash, text, id, encode, decode, summarize, normalize, validateFiles, contextText, sectionForEntry, sectionRoot, recordPath, indexPath, safeFileId } = require('./core.cjs');
const { DocumentMemories } = require('./document-memory.cjs');
const { stableRecordId, validRecordId } = require('./document-links.cjs');
const { MemoryViews } = require('./memory-views.cjs');
const { HtmlPreviews } = require('./html-preview.cjs');
const { readRecallTraces } = require('./recall-traces.cjs');
const { forgetMemory } = require('./memory-removal.cjs');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const notFound = error => {
  const code = String(error?.code ?? error?.errorCode ?? '');
  if (/ENOENT|NOT_FOUND/i.test(code)) return true;
  return /ENOENT|NOT_FOUND|not found|does not exist|cannot list/i.test(String(error?.message || error));
};
const IGNORED_NAMES = new Set(['.DS_Store', 'index.json', 'project.json', '.gitkeep']);
const isSystemFile = name => !name || IGNORED_NAMES.has(name) || name.startsWith('._') || name.startsWith('.');
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac', 'wma']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);
const PDF_EXTS = new Set(['pdf']);
const WORD_EXTS = new Set(['docx', 'doc', 'dotx', 'dot']);
const WPS_EXTS = new Set(['wps', 'wpt', 'et', 'ett', 'dps', 'dpt']);
const INDEX_VERSION = 1;
const LIST_PAGE = 1000;
const RACY_WINDOW_MS = 2000;
const MEMORY_CAPABILITIES = Object.freeze({schemaVersion:1,overview:true,explain:true,recallTraces:true,modes:Object.freeze(['automatic','manual'])});
const META_FIELDS = ['schemaVersion','id','recordId','documentRef','documentLink','scopePaths','importance','title','category','kind','status','tags','topics','source','createdAt','updatedAt','path','revision','section'];
const publicMeta = source => META_FIELDS.reduce((meta, key) => { if (source[key] !== undefined) meta[key] = source[key]; return meta; }, {});
class WikiService {
  constructor(pi) { this.pi = pi; this.queue = Promise.resolve(); this.disposed = false; this.racyWindowMs = RACY_WINDOW_MS; this.listPage = LIST_PAGE; this.documentMemories = new DocumentMemories(this); this.htmlPreviews = new HtmlPreviews(this); this.memoryViews = new MemoryViews(this); }
  dispose() { this.disposed = true; }
  async workspace(expected) {
    if (this.disposed) throw new Error('PLUGIN_UNLOADED');
    const workspace = await this.pi.workspace.get();
    if (!workspace || workspace.path.startsWith('remote-project:')) throw new Error('LOCAL_PROJECT_REQUIRED');
    if (expected !== undefined && expected !== workspace.path) throw new Error('WORKSPACE_CHANGED');
    return workspace;
  }
  async readFile(path, workspacePath) {
    await this.workspace(workspacePath);
    const raw = await this.pi.fs.readText(path);
    await this.workspace(workspacePath);
    return raw;
  }
  async exists(path, workspacePath) {
    try { return await this.readFile(path, workspacePath); } catch (error) { if (notFound(error)) return null; throw error; }
  }
  async writeFile(path, value, workspacePath) {
    await this.workspace(workspacePath);
    await this.pi.fs.writeText(path, value);
    await this.workspace(workspacePath);
  }
  async writeVerified(path, raw, workspacePath) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.writeFile(path, raw, workspacePath);
      const actual = await this.exists(path, workspacePath);
      if (actual !== null && hash(actual) === hash(raw)) return;
    }
    throw new Error(`WRITE_VERIFY_FAILED: ${path} was not written as expected; reload before saving again`);
  }
  sectionForInput(input) {
    if (input.section && SECTIONS.includes(input.section)) return input.section;
    if (input.kind === 'memory' || input.category === 'memory') return 'memory';
    if (input.kind === 'handoff' || input.category === 'development') return 'development';
    return 'knowledge';
  }
  sectionsForInput(input) {
    if (input.section && SECTIONS.includes(input.section)) return [input.section];
    if (input.kind === 'memory' || input.category === 'memory') return ['memory'];
    if (input.kind === 'handoff' || input.category === 'development') return ['development'];
    return SECTIONS;
  }
  async readIndex(section, workspacePath) {
    const raw = await this.exists(indexPath(section), workspacePath);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version !== INDEX_VERSION || parsed.section !== section || !Array.isArray(parsed.entries)) return [];
      return parsed.entries.filter(row => row && typeof row.path === 'string');
    } catch { return []; }
  }
  async writeIndex(section, workspacePath, entries) {
    const body = JSON.stringify({ version: INDEX_VERSION, section, generatedAt: new Date().toISOString(), entries });
    try { await this.writeFile(indexPath(section), body, workspacePath); } catch { /* derived cache is optional */ }
  }
  async rememberRecord(workspacePath, path, raw) {
    const entry = decode(raw, path);
    const section = sectionForEntry(entry);
    let mtimeMs;
    try { mtimeMs = (await this.pi.fs.stat(path)).mtimeMs; } catch { mtimeMs = undefined; }
    const rows = await this.readIndex(section, workspacePath);
    const kept = rows.filter(row => row.path !== path);
    if (mtimeMs === undefined) return this.writeIndex(section, workspacePath, kept);
    await this.writeIndex(section, workspacePath, [...kept, { ...publicMeta(entry), size: Buffer.byteLength(raw), mtimeMs }]);
  }
  async forgetIndexRow(section, workspacePath, path) {
    const rows = await this.readIndex(section, workspacePath);
    if (rows.length) await this.writeIndex(section, workspacePath, rows.filter(row => row.path !== path));
  }
  async listRecords(section, workspacePath) {
    await this.workspace(workspacePath);
    if (typeof this.pi.fs.list !== 'function') throw new Error('HOST_TOO_OLD: this PI-Desktop build has no fs.list; update PI-Desktop to use this plugin');
    const files = []; const categories = new Set();
    let directories = [];
    if (section === 'knowledge') {
      let rootListing;
      try { rootListing = await this.pi.fs.list(KNOWLEDGE_ROOT); }
      catch (error) { if (notFound(error)) return { files, categories: [...categories] }; throw error; }
      if (rootListing.length >= this.listPage) throw new Error(`LIBRARY_SCAN_LIMIT: ${KNOWLEDGE_ROOT} holds at least ${this.listPage} entries, the host list page, so the library cannot be read completely`);
      directories = rootListing.filter(item => item.isDirectory && isKnowledgeCategory(item.name));
      const rootFiles = rootListing.filter(item => !item.isDirectory && !isSystemFile(item.name));
      if (rootFiles.length) {
        categories.add('general');
        for (const item of rootFiles) {
          files.push({ path: item.path, size: item.size, mtimeMs: item.mtimeMs, category: 'general' });
        }
      }
    } else directories = [{ name: section, path: sectionRoot(section) }];
    for (const directoryEntry of directories) {
      const directory = directoryEntry.path || `${KNOWLEDGE_ROOT}/${directoryEntry.name}`;
      let listing;
      try { listing = await this.pi.fs.list(directory); }
      catch (error) { if (notFound(error)) continue; throw error; }
      if (listing.length >= this.listPage) throw new Error(`LIBRARY_SCAN_LIMIT: ${directory} holds at least ${this.listPage} entries, the host list page, so the library cannot be read completely; archive or split it`);
      if (section === 'knowledge') categories.add(directoryEntry.name);
      for (const item of listing) {
        if (item.isDirectory || isSystemFile(item.name)) continue;
        files.push({ path: item.path, size: item.size, mtimeMs: item.mtimeMs, category: directoryEntry.name });
      }
    }
    await this.workspace(workspacePath);
    return { files, categories: [...categories] };
  }
  async scan(section, workspacePath, options = {}) {
    const listing = await this.listRecords(section, workspacePath); const files = listing.files;
    if (files.length > 2000) throw new Error('LIBRARY_LIMIT: at most 2000 records per section');
    const cached = new Map((options.reindex ? [] : await this.readIndex(section, workspacePath)).map(row => [row.path, row]));
    const now = Date.now() + 1; const rows = []; const entries = []; const corrupted = []; let changed = options.reindex === true; let totalBytes = 0;
    for (const file of files) {
      totalBytes += typeof file.size === 'number' ? file.size : 0;
      if (totalBytes > 48 * 1024 * 1024) throw new Error(`LIBRARY_SIZE_LIMIT: ${section} exceeds 48 MiB`);
      const hit = cached.get(file.path);
      const reusable = hit && hit.size === file.size && hit.mtimeMs === file.mtimeMs && typeof file.mtimeMs === 'number' && file.mtimeMs + this.racyWindowMs <= now;
      if (reusable) {
        rows.push(hit);
        if (hit.corrupted) corrupted.push({ path: hit.path, id: hit.id, reason: hit.reason }); else entries.push(publicMeta(hit));
        continue;
      }
      changed = true;
      const fileName = file.path.split('/').at(-1);
      const isMd = /\.md$/i.test(fileName);
      if (isMd) {
        const raw = await this.readFile(file.path, workspacePath);
        try {
          const entry = decode(raw, file.path);
          const row = { ...publicMeta(entry), revision: hash(raw), size: Buffer.byteLength(raw), mtimeMs: file.mtimeMs };
          rows.push(row); entries.push(publicMeta(row));
        } catch (error) {
          const row = { path: file.path, id: file.path.slice(file.path.lastIndexOf('/') + 1, -3), size: file.size, mtimeMs: file.mtimeMs, corrupted: true, reason: String(error?.message || error) };
          rows.push(row); corrupted.push({ path: row.path, id: row.id, reason: row.reason });
        }
      } else {
        const ext = fileName.split('.').at(-1)?.toLowerCase();
        let kind = 'attachment';
        if (IMAGE_EXTS.has(ext)) kind = 'image';
        else if (AUDIO_EXTS.has(ext)) kind = 'audio';
        else if (VIDEO_EXTS.has(ext)) kind = 'video';
        else if (PDF_EXTS.has(ext)) kind = 'pdf';
        const fileDate = new Date(file.mtimeMs || Date.now()).toISOString();
        const row = {
          schemaVersion: 1,
          id: fileName,
          title: fileName,
          category: file.category || 'general',
          kind,
          status: 'draft',
          tags: [],
          topics: [],
          source: '',
          createdAt: fileDate,
          updatedAt: fileDate,
          path: file.path,
          size: file.size,
          mtimeMs: file.mtimeMs,
          section: 'knowledge',
          revision: `${file.size}-${file.mtimeMs}`
        };
        rows.push(row);
        entries.push(publicMeta(row));
      }
    }
    const ids = new Set();
    for (const entry of entries) { if (ids.has(entry.id)) throw new Error(`DUPLICATE_DOCUMENT_ID: ${section}`); ids.add(entry.id); }
    if (changed) await this.writeIndex(section, workspacePath, rows);
    return { entries: entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), corrupted, rows, categories: listing.categories };
  }
  async scanAll(workspacePath, options = {}) {
    const sections = {};
    for (const section of SECTIONS) sections[section] = await this.scan(section, workspacePath, options);
    return sections;
  }
  async loadRecord(meta, workspacePath) {
    if (meta.path.endsWith('.md')) {
      const entry = decode(await this.readFile(meta.path, workspacePath), meta.path);
      return this.htmlPreviews.attach(await this.documentMemories.resolve(entry, workspacePath), workspacePath);
    }
    const fileName = meta.path.split('/').at(-1);
    let previewDataUrl = '';
    if ((meta.kind === 'image' || meta.kind === 'audio' || meta.kind === 'video' || meta.kind === 'pdf') && typeof this.pi.fs?.readPreview === 'function') {
      try {
        const preview = await this.pi.fs.readPreview(meta.path);
        if (typeof preview === 'string') previewDataUrl = preview;
        else if (preview && typeof preview.dataUrl === 'string') previewDataUrl = preview.dataUrl;
      } catch {}
    }
    return this.htmlPreviews.attach({
      ...meta,
      content: '',
      files: [{ path: fileName, size: meta.size, dataUrl: previewDataUrl }]
    }, workspacePath);
  }
  async snapshot() {
    const workspace = await this.workspace();
    const raw = await this.exists(`${ROOT}/project.json`, workspace.path);
    if (raw !== null && JSON.parse(raw).schemaVersion !== 1) throw new Error('UNSUPPORTED_PROJECT_VERSION');
    if (raw === null) {
      const emptySections = { knowledge: { categories: [], entries: [], corrupted: [] }, memory: { entries: [], corrupted: [] }, development: { entries: [], corrupted: [] } };
      return { workspacePath: workspace.path, projectName: workspace.name, initialized: false, entries: [], corrupted: [], sections: emptySections, memoryCapabilities:MEMORY_CAPABILITIES };
    }
    const scanned = await this.scanAll(workspace.path);
    const memories = await this.documentMemories.projectRows(scanned.memory.entries, scanned.knowledge.rows, workspace.path);
    const sections = {
      knowledge: { categories: scanned.knowledge.categories || [], entries: scanned.knowledge.entries.map(summarize), corrupted: scanned.knowledge.corrupted },
      memory: { entries: memories.map(summarize), corrupted: scanned.memory.corrupted },
      development: { entries: scanned.development.entries.map(summarize), corrupted: scanned.development.corrupted },
    };
    return { workspacePath: workspace.path, projectName: workspace.name, initialized: true, entries: [...sections.knowledge.entries, ...sections.memory.entries, ...sections.development.entries], corrupted: [...sections.knowledge.corrupted, ...sections.memory.corrupted, ...sections.development.corrupted], sections, memoryCapabilities:MEMORY_CAPABILITIES };
  }
  async initialized(workspacePath) {
    const raw = await this.exists(`${ROOT}/project.json`, workspacePath);
    if (!raw) throw new Error('INITIALIZE_LIBRARY_FIRST');
    if (JSON.parse(raw).schemaVersion !== 1) throw new Error('UNSUPPORTED_PROJECT_VERSION');
  }
  async init(workspacePath) {
    const workspace = await this.workspace(workspacePath);
    if (await this.exists(`${ROOT}/project.json`, workspacePath) === null) {
      const intro = `# ${workspace.name}\n\nKnowledge is a general project information space. Agent memory is a separate automatic layer.\n\nKnowledge categories are created as needed by the Agent or the user.\n\n- memory/\n`;
      if (await this.exists(`${ROOT}/index.md`, workspacePath) === null) await this.writeVerified(`${ROOT}/index.md`, intro, workspacePath);
      await this.writeVerified(`${ROOT}/project.json`, JSON.stringify({ schemaVersion:1, name:workspace.name, createdAt:new Date().toISOString(), layout:'knowledge-memory-development-v1' }, null, 2), workspacePath);
    }
    for (const section of SECTIONS) if (await this.exists(indexPath(section), workspacePath) === null) await this.writeIndex(section, workspacePath, []);
    return this.snapshot();
  }
  async read(input) {
    const explicit = input.recordId !== undefined;
    if (explicit && !validRecordId(input.recordId)) throw new Error('INVALID_RECORD_ID');
    const documentId = explicit ? input.recordId : id(input.id);
    const stable = validRecordId(documentId);
    for (const section of this.sectionsForInput(input)) {
      const { entries, corrupted } = await this.scan(section, input.workspacePath, { reindex: stable && section === 'knowledge' });
      const filename = explicit ? undefined : entries.find(entry => entry.id === documentId);
      let identity;
      if (stable) {
        const matches = entries.filter(entry => entry.kind === 'document' && stableRecordId(entry) === documentId);
        const active = matches.filter(entry => entry.status !== 'archived');
        if (active.length > 1) throw new Error('AMBIGUOUS_DOCUMENT');
        identity = active[0] || matches[0];
      }
      if (filename && identity && filename.path !== identity.path) throw new Error('AMBIGUOUS_DOCUMENT');
      const meta = identity || filename;
      if (meta) {
        try { return await this.loadRecord(meta, input.workspacePath); }
        catch (error) { throw new Error(`DOCUMENT_CORRUPTED: ${documentId} could not be read (${error?.message || error})`); }
      }
      if (!explicit && corrupted.some(item => item.id === documentId)) throw new Error(`DOCUMENT_CORRUPTED: ${documentId} exists but cannot be parsed; repair or delete that file, then retry`);
    }
    throw new Error('DOCUMENT_NOT_FOUND');
  }
  async checkCapacity(section, entry, raw, workspacePath, rows) {
    const path = recordPath(entry);
    const others = rows.filter(row => row.path !== path);
    if (others.length >= 2000) throw new Error(`LIBRARY_LIMIT: ${section}`);
    const size = Buffer.byteLength(raw) + others.reduce((sum, row) => sum + (typeof row.size === 'number' ? row.size : 0), 0);
    if (size > 48 * 1024 * 1024) throw new Error(`LIBRARY_SIZE_LIMIT: ${section}`);
  }
  async save(input) {
    await this.initialized(input.workspacePath);
    let previous;
    if (input.id || input.recordId) previous = await this.read(input);
    if (previous && input.expectedRevision !== previous.revision) throw new Error('REVISION_CONFLICT: reload before saving; your draft has not been written');
    if (!previous && !['document','memory','handoff'].includes(input.kind || 'document')) throw new Error('USE_IMPORT_FOR_ASSETS');
    const entry = normalize(input, previous);
    if (entry.kind === 'document') {
      let candidateId = entry.id;
      let counter = 1;
      while (true) {
        const testPath = recordPath({ ...entry, id: candidateId });
        if (previous && previous.path === testPath) {
          entry.id = candidateId;
          break;
        }
        const existing = await this.exists(testPath, input.workspacePath);
        if (existing === null) {
          entry.id = candidateId;
          break;
        }
        counter++;
        candidateId = `${safeFileId(entry.title)}-${counter}`;
      }
    }
    const section = sectionForEntry(entry); const path = recordPath(entry); const raw = encode(entry);
    const { rows } = await this.scan(section, input.workspacePath);
    await this.checkCapacity(section, entry, raw, input.workspacePath, rows);
    if (previous) {
      const current = await this.readFile(previous.path, input.workspacePath);
      if (hash(current) !== previous.revision) throw new Error('REVISION_CONFLICT');
    }
    await this.writeVerified(path, raw, input.workspacePath);
    await this.rememberRecord(input.workspacePath, path, raw);
    if (previous && previous.path !== path) {
      try {
        await this.pi.fs.remove(previous.path);
      } catch {
        try {
          const archivedOld = { ...previous, status: 'archived', updatedAt: new Date().toISOString() };
          await this.writeVerified(previous.path, encode(archivedOld), input.workspacePath);
        } catch {}
      }
      await this.forgetIndexRow(section, input.workspacePath, previous.path);
    }
    return decode(raw, path);
  }
  async importFiles(input) {
    await this.initialized(input.workspacePath);
    if (!['prototype','image','attachment','audio','video','pdf'].includes(input.kind)) throw new Error('INVALID_IMPORT_KIND');
    const files = validateFiles(input.files, input.kind, input.entryPath);
    const defaultCat = input.kind === 'prototype' ? 'prototypes' : input.kind === 'image' ? 'assets' : 'attachments';
    const entry = normalize({ ...input, category: input.category || defaultCat, status: 'draft', content: input.content || '' });
    entry.files = files; if (input.entryPath) entry.entryPath = input.entryPath;
    const raw = encode(entry); const path = recordPath(entry); const section = sectionForEntry(entry); const { rows } = await this.scan(section, input.workspacePath);
    await this.checkCapacity(section, entry, raw, input.workspacePath, rows);
    await this.writeVerified(path, raw, input.workspacePath); await this.rememberRecord(input.workspacePath, path, raw);
    return decode(raw, path);
  }
  async search(input) {
    const query = text(input.query || '', 'query', 500).trim().toLowerCase(); const terms = query.split(/\s+/).filter(Boolean); const results = [];
    for (const section of input.section && SECTIONS.includes(input.section) ? [input.section] : SECTIONS) {
      const { entries } = await this.scan(section, input.workspacePath);
      for (const meta of entries) {
        if (meta.status === 'archived') continue;
        let entry; try { entry = await this.loadRecord(meta, input.workspacePath); } catch { continue; }
        const title = `${entry.title} ${entry.tags.join(' ')} ${entry.topics.join(' ')}`.toLowerCase(); const body = entry.content.toLowerCase();
        const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 5 : 0) + (body.includes(term) ? 1 : 0), 0); const at = Math.max(0, body.indexOf(terms[0] || ''));
        results.push({ ...summarize(entry), excerpt: entry.content.slice(Math.max(0, at - 60), at + 220), score });
      }
    }
    return results.filter(entry => !terms.length || entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 80);
  }
  async context(input) { return this.memoryViews.context(input); }
  async preferencesGet() { const settings = await this.pi.plugin.getSettings(); const content = typeof settings.personalPreferences === 'string' ? settings.personalPreferences : ''; return { content, revision:hash(content) }; }
  async exportHtml(input) {
    const scanned = await this.scan('knowledge', input.workspacePath); if (scanned.corrupted.length) throw new Error(`LIBRARY_CORRUPTED: ${scanned.corrupted.length} knowledge record(s) could not be parsed`);
    const entries = []; for (const meta of scanned.entries.filter(e => e.status !== 'archived')) { try { entries.push(await this.loadRecord(meta, input.workspacePath)); } catch { /* changed under us */ } }
    const { name } = await this.workspace(input.workspacePath); const sections = entries.map(e => `<article id="${escapeHtml(e.id)}"><p>${escapeHtml(e.category)} · ${escapeHtml(e.status)}</p><h2>${escapeHtml(e.title)}</h2><pre>${escapeHtml(e.content)}</pre>${(e.files || []).filter(f => f.dataUrl).map(f => `<figure><img alt="${escapeHtml(f.path)}" src="${f.dataUrl}"><figcaption>${escapeHtml(f.path)}</figcaption></figure>`).join('')}<small>${escapeHtml(e.source || e.path)}</small></article>`).join('\n');
    return { html:`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(name)} — BoneProjectWiki</title><style>body{font:16px/1.7 Georgia,serif;max-width:920px;margin:48px auto;padding:0 24px;color:#25302c;background:#fafaf6}article{border-top:1px solid #ccd4ce;margin-top:40px;padding-top:24px}pre{white-space:pre-wrap;font:inherit}img{max-width:100%;max-height:600px}a{color:#24634a}small{overflow-wrap:anywhere}</style><h1>${escapeHtml(name)}</h1><p>BoneProjectWiki · Static knowledge export. Personal, memory and development records are excluded.</p><nav>${entries.map(e=>`<p><a href="#${escapeHtml(e.id)}">${escapeHtml(e.title)}</a></p>`).join('')}</nav>${sections}</html>` };
  }
  async move(input) {
    await this.initialized(input.workspacePath);
    const entry = await this.read(input);
    if (input.expectedRevision && entry.revision !== input.expectedRevision) throw new Error('REVISION_CONFLICT');
    const targetCategory = text(input.targetCategory || 'general', 'category', 64).trim();
    if (!isKnowledgeCategory(targetCategory)) throw new Error('INVALID_KNOWLEDGE_CATEGORY');
    if (entry.category === targetCategory) return entry;
    const oldPath = entry.path;
    const updated = { ...entry, category: targetCategory, updatedAt: new Date().toISOString() };
    const newPath = recordPath(updated);
    const raw = encode(updated);
    await this.writeVerified(newPath, raw, input.workspacePath);
    await this.rememberRecord(input.workspacePath, newPath, raw);
    try { await this.pi.fs.remove(oldPath); }
    catch {
      const archivedOld = { ...entry, status: 'archived', updatedAt: new Date().toISOString() };
      await this.writeVerified(oldPath, encode(archivedOld), input.workspacePath);
    }
    await this.forgetIndexRow('knowledge', input.workspacePath, oldPath);
    return decode(raw, newPath);
  }
  async deleteRecord(input) {
    await this.initialized(input.workspacePath);
    const entry = await this.read(input);
    if (input.expectedRevision && entry.revision !== input.expectedRevision) throw new Error('REVISION_CONFLICT');
    if (entry.kind === 'memory') return {...await forgetMemory(this,{...input,expectedRevision:input.expectedRevision || entry.revision}),id:entry.id};
    await this.workspace(input.workspacePath);
    try {
      await this.pi.fs.remove(entry.path);
    } catch {
      const updated = { ...entry, status: 'archived', updatedAt: new Date().toISOString() };
      await this.writeVerified(entry.path, encode(updated), input.workspacePath);
    }
    const section = sectionForEntry(entry);
    await this.forgetIndexRow(section, input.workspacePath, entry.path);
    return { deleted: true, id: entry.id };
  }
  async reveal(input) {
    await this.workspace(input.workspacePath);
    let targetPath = input.path;
    if (!targetPath && input.id) {
      const entry = await this.read(input);
      targetPath = entry.path;
    }
    if (typeof targetPath === 'string') {
      if (typeof this.pi.fs?.reveal === 'function') {
        await this.pi.fs.reveal(targetPath);
      }
      return { revealed: true, path: targetPath };
    }
  }
  async createCategory(input) {
    await this.initialized(input.workspacePath);
    const category = text(input.category || '', 'category', 64).trim();
    if (!isKnowledgeCategory(category)) throw new Error('INVALID_KNOWLEDGE_CATEGORY');
    const markerPath = `${KNOWLEDGE_ROOT}/${category}/.gitkeep`;
    await this.writeVerified(markerPath, '', input.workspacePath);
    return { created: true, category };
  }
  async deleteCategory(input) {
    await this.initialized(input.workspacePath);
    const category = text(input.category || '', 'category', 64).trim();
    if (!isKnowledgeCategory(category)) throw new Error('INVALID_KNOWLEDGE_CATEGORY');
    const dir = `${KNOWLEDGE_ROOT}/${category}`;
    let listing = [];
    try { listing = await this.pi.fs.list(dir); }
    catch (error) { if (notFound(error)) return { deleted: true, category }; throw error; }
    for (const item of listing) {
      if (item.isDirectory) continue;
      try {
        await this.pi.fs.remove(item.path);
      } catch {
        try {
          const raw = await this.readFile(item.path, input.workspacePath);
          const entry = decode(raw, item.path);
          const archived = { ...entry, status: 'archived', updatedAt: new Date().toISOString() };
          await this.writeVerified(item.path, encode(archived), input.workspacePath);
        } catch {}
      }
      await this.forgetIndexRow('knowledge', input.workspacePath, item.path);
    }
    try { await this.pi.fs.remove(dir); } catch {}
    return { deleted: true, category };
  }
  async openDefault(input) {
    await this.workspace(input.workspacePath);
    let targetPath = input.path;
    if (!targetPath && input.id) {
      const entry = await this.read(input);
      targetPath = entry.path;
    }
    if (typeof targetPath === 'string' && typeof this.pi.fs?.openDefault === 'function') {
      await this.pi.fs.openDefault(targetPath);
      return { opened: true, path: targetPath };
    }
    return { opened: false };
  }
  async dispatch(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_REQUEST');
    if (input.action === 'snapshot') return this.snapshot();
    if (typeof input.workspacePath !== 'string') throw new Error('WORKSPACE_REQUIRED');
    await this.workspace(input.workspacePath);
    switch (input.action) {
      case 'init': return this.init(input.workspacePath);
      case 'read': return this.read(input);
      case 'save': return this.save(input);
      case 'remember': return this.documentMemories.remember(input);
      case 'import': return this.importFiles(input);
      case 'search': return this.search(input);
      case 'context': return this.context(input);
      case 'memoryOverview': return this.memoryViews.overview(input);
      case 'memoryTraces': return readRecallTraces(this.pi,input.workspacePath);
      case 'export': return this.exportHtml(input);
      case 'reindex': { const sections = {}; for (const section of SECTIONS) { const scan = await this.scan(section, input.workspacePath, { reindex:true }); sections[section] = { records:scan.entries.length, corrupted:scan.corrupted.length }; } return { sections }; }
      case 'preferencesGet': return this.preferencesGet();
      case 'preferencesSave': { const current = await this.preferencesGet(); if (current.revision !== input.expectedRevision) throw new Error('REVISION_CONFLICT'); const content = text(input.content, 'preferences', 10000); await this.workspace(input.workspacePath); await this.pi.plugin.setSettings({ personalPreferences:content }); return { content, revision:hash(content) }; }
      case 'forget': return forgetMemory(this,input);
      case 'move': return this.move(input);
      case 'delete': return this.deleteRecord(input);
      case 'reveal': return this.reveal(input);
      case 'createCategory': return this.createCategory(input);
      case 'deleteCategory': return this.deleteCategory(input);
      case 'openDefault': return this.openDefault(input);
      default: throw new Error('UNKNOWN_ACTION');
    }
  }
  request(input) { const result = this.queue.then(() => this.dispatch(input)); this.queue = result.catch(() => undefined); return result; }
}
module.exports = { WikiService };
