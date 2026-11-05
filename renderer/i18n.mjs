const words = {
  en: {
    readOnly: 'Read-only', readMode: 'Read mode', emptyDocument: 'This document is empty.', markdownUnavailable: 'Formatting is unavailable. The source is shown below.',
    editMode: 'Edit mode',
    htmlPreviewOptions: 'Webpage actions',
    htmlPreview: 'Webpage preview', openInSystem: 'Open in system', htmlPreviewMissing: 'Some local resources could not be loaded:', htmlPreviewLimit: 'This preview exceeds the 100-file or 10 MB limit. Open the file in your system browser.', htmlPreviewUnavailable: 'The HTML file could not be read. Check the file or open it in your system browser.',
    memorySettings: 'Scope and priority', memoryScope: 'Applies to project paths', memoryScopePlaceholder: 'apps/payments, packages/billing', memoryScopeHelp: 'Leave empty for this project. Otherwise use relative paths, separated by commas. Scoped memories apply only when the task names a matching path.', coreMemory: 'Core rule: keep space within its applicable scope', confirmMemory: 'Confirmed and available to future tasks', candidateMemoryHelp: 'Unconfirmed drafts stay in the library and do not enter automatic or manual context.',
    linkedDocument: 'Linked document', readOriginal: 'Read current document', rememberDocument: 'Link document to memory', memorySummary: 'Short memory summary', readWhen: 'When to read the full document', confirmDocument: 'I confirm this document contains the current agreed rules.', confirmAndRemember: 'Confirm and link', rememberDocumentHelp: 'Keep the full rules in this document. Memory keeps a short summary and reads this source when relevant.', memoryLinked: 'Document saved and memory linked', memoryLinkPartial: 'Document saved; memory link failed. Your summary is kept here. Retry to complete the link.', saveBeforeLink: 'Wait for the document to finish saving before linking memory.',
    link_current: 'Summary matches the current document. Read the original for full rules and exceptions.', link_stale: 'The document changed. This old summary is withheld; read the source and refresh the summary.', link_draft: 'The document is a draft. Its summary is not used as a confirmed rule.', link_archived: 'The document is archived. Its summary is no longer used.', link_missing: 'The source document is missing. This summary is not used.', link_unreadable: 'The source could not be verified. This summary is not used.', link_ambiguous: 'More than one source has this identity. Resolve the conflict before using the rule.',
    fixedLocation: 'Directory and record type are fixed after creation. Use topics to group records across directories.',
    fixedLocation: 'Directory and record type are fixed after creation. Use topics to group records across directories.', general: 'General', notes: 'Notes', references: 'References', research: 'Research', resources: 'Resources', knowledge: 'Knowledge base', projectMemory: 'Project memory', library: 'Project knowledge', directories: 'Directory', overview: 'Overview', requirements: 'Requirements', business: 'Business', technical: 'Technical', prototypes: 'Prototypes', assets: 'Assets', attachments: 'Attachments', decisions: 'Decisions', development: 'Development', memory: 'Memory', inbox: 'Inbox', archive: 'Archive',
    noCategories: 'No categories yet. Agent-created directories will appear here.',
    new: 'New record', import: 'Import files', preferences: 'Preferences', context: 'Project context', export: 'Export HTML', refresh: 'Refresh', search: 'Search knowledge', searchMemory: 'Search memory', allTopics: 'All topics', allCategories: 'All directories', all: 'All records', loading: 'Loading…', working: 'Working…', saved: 'Saved', initialized: 'Library initialized', empty: 'A place for what matters', emptyBody: 'Keep decisions, requirements and project memory together. Create a record or import a prototype to begin.', noRecords: 'No records yet', corrupted: 'Records could not be parsed', noResults: 'No matching records', noResultsBody: 'Try another search, topic or directory.', select: 'Open a record', selectBody: 'Choose a record to read, review or update it.', init: 'Initialize library', initBody: 'Create the project knowledge library in this workspace.', unavailable: 'Open this panel in PI-Desktop to connect to your project.', noWorkspace: 'Select a project workspace in PI-Desktop.', retry: 'Try again', title: 'Title', category: 'Directory', kind: 'Record type', status: 'Status', topics: 'Topics', tags: 'Tags', source: 'Source (optional)', content: 'Content', separated: 'Separate with commas', document: 'Document', handoff: 'Handoff', prototype: 'Prototype', image: 'Image', attachment: 'Attachment', draft: 'Draft', confirmed: 'Confirmed', archived: 'Archived', save: 'Save record', cancel: 'Cancel', edit: 'Edit record', forget: 'Forget memory', forgetConfirm: 'Permanently forget this memory? This cannot be undone.', deleted: 'Memory forgotten', discard: 'Discard your unsaved changes?', unsaved: 'Unsaved changes', stale: 'The workspace or session changed. Your draft is kept here. Saving is blocked; copy what you need, then discard it to load the current workspace.', discardDraft: 'Discard draft and refresh', preferencesHelp: 'Personal preferences stay in private plugin settings across projects and are excluded from project exports. Saving makes no AI request.', savePreferences: 'Save preferences', contextHelp: 'Read-only project context prepared by the library.', importHelp: 'Choose files or a folder, or drop files here. HTML, CSS, JavaScript, text and PNG/JPEG/WEBP/GIF only. Maximum 100 files and 10 MB per bundle.', files: 'Choose files', folder: 'Choose folder', entryPath: 'Prototype entry HTML', importType: 'Import as', importTitle: 'Bundle title', importReady: 'Files ready', importDone: 'Import completed', unsupported: 'Unsupported binary or file type', limit: 'A bundle may contain at most 100 files and 10 MB.', duplicate: 'Duplicate file path', noFiles: 'Choose at least one file.', noHtml: 'Choose an HTML entry for the prototype.', imageOnly: 'Image imports accept PNG, JPEG, WEBP or GIF files only.', limitations: 'Isolated preview: local scripts and styles only. Module imports, network requests, remote fonts, frames, forms and popups are unavailable.', noPreview: 'No supported preview is available for this file.', exportDone: 'HTML export downloaded', changed: 'Workspace changed; action cancelled.', folderDrop: 'For complete folders, use Choose folder.', error: 'Could not complete this action', count: 'records', revision: 'Revision', pending: 'Loading current workspace…', close: 'Close', more: 'More', dropTitle: 'Drop files to import into Knowledge Base', dropSubtitle: 'Supports Markdown (.md), text (.txt) and images (.png, .jpg, .webp)', importSuccess: 'Imported', moveTo: 'Move to…', deleteDoc: 'Delete', deleteConfirm: 'Permanently delete this record? This cannot be undone.', deletedDoc: 'Record deleted', revealInFinder: 'Reveal in File Manager', newFolder: 'New directory…', deleteCategory: 'Delete folder', deleteCategoryConfirm: 'Permanently delete this folder and all its contents? This cannot be undone.', deletedCategory: 'Folder deleted', fileExplorer: 'Files'
  },
  zh: {
    readOnly: '只读', readMode: '只读模式', emptyDocument: '这篇文档还没有正文。', markdownUnavailable: '暂时无法排版，以下显示原文。',
    editMode: '编辑模式',
    htmlPreviewOptions: '网页操作',
    htmlPreview: '网页预览', openInSystem: '在系统中打开', htmlPreviewMissing: '以下本地资源未能加载：', htmlPreviewLimit: '预览超过 100 个文件或 10 MB 的限制，请在系统浏览器中打开。', htmlPreviewUnavailable: '无法读取 HTML 文件，请检查原文件，或在系统浏览器中打开。',
    memorySettings: '适用范围与优先级', memoryScope: '适用的项目路径', memoryScopePlaceholder: 'apps/payments, packages/billing', memoryScopeHelp: '留空表示当前项目。多个相对路径用逗号分隔；只有任务明确涉及匹配路径时，才使用限定范围的记忆。', coreMemory: '核心规则：在适用范围内保留上下文预算', confirmMemory: '内容已确认，可用于后续任务', candidateMemoryHelp: '未确认草稿保留在记忆页，不进入自动或手动上下文。',
    linkedDocument: '关联文档', readOriginal: '读取当前原文', rememberDocument: '将文档关联到记忆', memorySummary: '简短记忆摘要', readWhen: '何时需要读取完整文档', confirmDocument: '我确认该文档包含当前已确认的规则。', confirmAndRemember: '确认并关联', rememberDocumentHelp: '完整规则保存在本文档中；记忆只保留摘要，并在相关任务中读取原文。', memoryLinked: '文档已保存，记忆已关联', memoryLinkPartial: '文档已保存，记忆关联失败。摘要已保留，可重试完成关联。', saveBeforeLink: '请等待文档自动保存完成，再建立记忆关联。',
    link_current: '摘要与当前文档一致，完整规则及例外请读取原文。', link_stale: '文档已变化，旧摘要已停止使用；请读取原文并更新摘要。', link_draft: '原文为草稿，不会将其摘要作为已确认规则。', link_archived: '原文已归档，摘要已停止使用。', link_missing: '原文不存在，摘要已停止使用。', link_unreadable: '暂时无法核验原文，摘要已停止使用。', link_ambiguous: '存在多个相同标识的原文，请先处理冲突再使用规则。',
    fixedLocation: '创建后目录和类型保持不变。可用业务专题跨目录归集记录。',
    fixedLocation: '创建后目录和类型保持不变。可用业务专题跨目录归集记录。', general: '通用', notes: '笔记', references: '资料', research: '研究', resources: '资源', knowledge: '知识库', projectMemory: '项目记忆', library: '项目知识库', directories: '目录', overview: '总览', requirements: '需求', business: '业务', technical: '技术', prototypes: '交互原型', assets: '图片资产', attachments: '附件', decisions: '决策', development: '开发进度', memory: '记忆', inbox: '待整理', archive: '归档',
    noCategories: '暂无分类，Agent 创建后会显示在这里。',
    new: '新建记录', import: '导入文件', preferences: '个人偏好', context: '项目上下文', export: '导出 HTML', refresh: '刷新', search: '搜索知识库', searchMemory: '搜索记忆', allTopics: '全部专题', allCategories: '全部目录', all: '全部记录', loading: '正在加载…', working: '正在处理…', saved: '已保存', initialized: '知识库已初始化', empty: '让重要的知识留在项目里', emptyBody: '集中整理决策、需求与项目记忆。新建记录或导入原型，开始积累。', noRecords: '还没有记录', corrupted: '有记录无法解析', noResults: '没有匹配的记录', noResultsBody: '试试其他关键词、业务专题或目录。', select: '打开一条记录', selectBody: '选择记录，阅读、确认或更新项目知识。', init: '初始化知识库', initBody: '在当前工作区创建项目知识库。', unavailable: '请在 PI-Desktop 中打开此面板以连接项目。', noWorkspace: '请在 PI-Desktop 中选择项目工作区。', retry: '重试', title: '标题', category: '目录', kind: '记录类型', status: '状态', topics: '业务专题', tags: '标签', source: '来源（可选）', content: '内容', separated: '用逗号分隔', document: '文档', handoff: '交接', prototype: '原型', image: '图片', attachment: '附件', draft: '草稿', confirmed: '已确认', archived: '已归档', save: '保存记录', cancel: '取消', edit: '编辑记录', forget: '遗忘记忆', forgetConfirm: '永久遗忘这条记忆？此操作无法撤销。', deleted: '已遗忘记忆', discard: '放弃尚未保存的修改？', unsaved: '有未保存的修改', stale: '工作区或会话已切换。草稿仍保留在这里，已禁止保存。请复制需要的内容，再放弃草稿并加载当前工作区。', discardDraft: '放弃草稿并刷新', preferencesHelp: '个人偏好保存在插件私有设置中，可跨项目使用，不会随项目知识库导出。保存不会请求 AI。', savePreferences: '保存偏好', contextHelp: '由知识库整理的项目上下文，只读展示。', importHelp: '选择文件、文件夹或拖入文件。支持 HTML、CSS、JavaScript、文本及 PNG/JPEG/WEBP/GIF。每次最多 100 个文件、10 MB。', files: '选择文件', folder: '选择文件夹', entryPath: '原型入口 HTML', importType: '导入类型', importTitle: '文件组标题', importReady: '文件已就绪', importDone: '导入完成', unsupported: '不支持的二进制或文件类型', limit: '每组文件不能超过 100 个文件、10 MB。', duplicate: '文件路径重复', noFiles: '请至少选择一个文件。', noHtml: '请为原型选择 HTML 入口。', imageOnly: '图片导入仅支持 PNG、JPEG、WEBP 或 GIF。', limitations: '隔离预览：仅支持本地脚本与样式。不支持模块导入、网络请求、远程字体、嵌套页面、表单和弹窗。', noPreview: '此文件暂无可用预览。', exportDone: 'HTML 导出已下载', changed: '工作区已切换，操作已取消。', folderDrop: '导入完整文件夹请使用“选择文件夹”。', error: '操作未完成', count: '条记录', revision: '版本', pending: '正在加载当前工作区…', close: '关闭', more: '更多', dropTitle: '拖放文件导入到项目知识库', dropSubtitle: '支持 Markdown 笔记 (.md)、纯文本 (.txt) 及图片 (.png, .jpg, .webp)', importSuccess: '已导入', moveTo: '移动到…', deleteDoc: '删除', deleteConfirm: '确定要永久删除此记录吗？此操作无法撤销。', deletedDoc: '记录已删除', revealInFinder: '打开文件位置', newFolder: '新建目录…', deleteCategory: '删除文件夹', deleteCategoryConfirm: '确定要永久删除此文件夹及其全部内容吗？此操作无法撤销。', deletedCategory: '文件夹已删除', fileExplorer: '文件'
  }
};
let language = 'zh';
export function setLocale(locale) { language = String(locale).toLowerCase().startsWith('zh') ? 'zh' : 'en'; document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; }
export const t = key => words[language][key] ?? key;
export const categories = ['general', 'notes', 'references', 'research', 'decisions', 'resources', 'prototypes', 'attachments', 'archive'];

export function errorText(error) {
  const raw = error instanceof Error ? error.message : String(error);
  if (language !== 'zh') return raw;
  const messages = {
    INVALID_MEMORY_SUMMARY: '摘要与读取场景须填写具体内容，且不能包含个人路径或敏感信息。',
    INVALID_MEMORY_SCOPE: '适用范围须为项目相对路径，不能包含上级目录、绝对路径或敏感信息，最多填写 16 项。',
    INVALID_MEMORY_IMPORTANCE: '记忆优先级无效，请选择普通记忆或核心规则。',
    MEMORY_METADATA_REQUIRES_MEMORY: '适用范围与优先级仅用于记忆；文档请通过关联记忆入口设置。',
    CONFIRMED_DOCUMENT_REQUIRED: '请确认文档包含当前已确认的规则，再建立记忆关联。',
    DOCUMENT_CONTENT_REQUIRED: '请先填写文档正文。',
    INVALID_DOCUMENT_REF: '记忆关联信息无效，请重新读取原文后建立关联。',
    INVALID_RECORD_ID: '文档稳定标识无效，请检查原文。',
    AMBIGUOUS_DOCUMENT: '多个文档使用相同标识，请先处理冲突。',
    DUPLICATE_MEMORY_LINK: '该文档存在重复记忆关联，请先处理重复记录。',
    REVISION_CONFLICT: '内容已被其他操作修改。请保留草稿，重新读取后合并修改。',
    WORKSPACE_CHANGED: '项目已切换，请刷新后重试。',
    LOCAL_PROJECT_REQUIRED: '请先选择一个本地项目。',
    INITIALIZE_LIBRARY_FIRST: '请先初始化当前项目的知识库。',
    DOCUMENT_NOT_FOUND: '记录不存在，可能已被移除，请刷新列表。',
    INVALID_MEMORY_CATEGORY: '项目记忆应放在项目记忆空间中。',
    LIBRARY_SIZE_LIMIT: '知识库已达到容量上限，请先拆分较大的资产集合。',
    LIBRARY_LIMIT: '知识库记录数量已达到上限。',
    LIBRARY_SCAN_LIMIT: '单个目录的记录数已到宿主的读取上限（500 条），无法完整读取，请归档或拆分后再试。',
    LIBRARY_CORRUPTED: '有记录无法解析，导出已阻止。请修复或删除损坏的记录后再试。',
    DOCUMENT_CORRUPTED: '这条记录的文件已损坏、无法解析。请修复或删除该文件后再操作。',
    WRITE_VERIFY_FAILED: '写入后校验未通过，保存未生效。请刷新后重试。',
    DELETE_VERIFY_FAILED: '删除后文件仍然存在，操作未生效。请刷新后重试。',
    INVALID_SINCE: '时间参数无效，请使用 ISO 时间格式。',
    HOST_TOO_OLD: '当前 PI-Desktop 版本缺少本插件需要的宿主接口，请先更新 PI-Desktop。',
    BUNDLE_TOO_LARGE: '导入文件总大小不能超过 10 MB。',
    UNSAFE_PATH: '文件路径无效，不能引用目录外的文件。',
    DUPLICATE_FILE: '导入文件中存在重复路径。',
    HTML_ENTRY_REQUIRED: '请选择有效的 HTML 原型入口文件。',
    TITLE_REQUIRED: '请填写标题。',
    PLUGIN_UNLOADED: '插件已停止，请重新打开。',
    UNSUPPORTED_IMAGE: '图片格式不受支持，请使用 PNG、JPEG、WebP 或 GIF。',
    IMMUTABLE_LOCATION: '记录创建后目录和类型保持固定，请使用业务专题归集。'
  };
  const code = Object.keys(messages).find(key => raw.includes(key));
  return code ? messages[code] : raw;
}
