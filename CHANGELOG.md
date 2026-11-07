# 更新日志（CHANGELOG）

## 0.3.6 (project-isolated requests)

- Resolve the actual host workspace before request admission, maintain independent project queues, and use one FIFO queue for sessions sharing a project. Calls in different projects can progress concurrently.
- Preserve each queued job's async invocation identity and give every operation a separate async-local scope, preventing queue pumps, body caches and search generations from crossing project boundaries.
- Keep plugin-wide personal preferences on a separate serialized settings queue. Retain at most 32 idle project entries and 32 search clients per project, without evicting active queues.
- Reject a real project rebind after admission, including while queued; a fresh snapshot rediscovers the new project. Caller path hints cannot choose a filesystem authority.
- Requires the corresponding host correction so workspace discovery, scoped files and registered-folder actions follow the invoking session instead of the foreground project. Updating this plugin alone does not fix an older host's routing.
- No record migration or additional permission is required. Existing data and source-verification rules remain unchanged.

## 0.3.5 (workspace discovery repair)

- Fix a 0.3.4 regression where a snapshot with an empty or stale optional `workspacePath` failed with `WORKSPACE_CHANGED`, blocking the discovery step before initialization or saving.
- Restore snapshot discovery from the actual host workspace. The operation binds to that discovered project at execution and still rejects a real project change during I/O.
- Other public actions and private save/search channels keep strict workspace matching; no record format, permission, memory metadata validation or migration changes.
- Add regressions for empty/stale hints, initialized and new libraries, the registered tool discovery/initialize/save/read path, queued recovery, project changes and unload.
- Restores the discovery contract used before 0.3.4 while preserving strict project matching for initialization, reads, writes and searches.

## 0.3.4 (offline XLSX previews, save and latest-search performance)

- Save and its full snapshot share one serialized operation. Verified bodies and scans are reused only within that operation; unchanged derived indexes are not rewritten. Final revision checks, target collision checks and write readback still use fresh bytes.
- Ordinary autosave keeps the editor, focus, selection and current input. Tree updates use current record identities and revisions, preserve association drafts and defer moving a held pointer target until its click finishes.
- Superseded panel searches leave the queue or stop at the next I/O boundary. Writes retain their FIFO position, independent clients and tool searches remain isolated, and older cancellation commands cannot cancel newer searches.
- Saved records retain their actual revision when a later refresh fails, allowing a safe retry. Existing public save results and capability-free panels keep their compatible path.
- Temporary local filesystem measurements: save plus snapshot body reads 414 to 212 for 200 documents and 1624 to 822 for 800 documents; index writes 3 to 1. The corresponding five-sample median durations were 56.80 to 36.08 ms and 154.58 to 93.16 ms. Timing is environment-specific.
- Includes the offline XLSX preview/import fix and first-stage search/formatter improvements previously validated as local 0.3.2 and 0.3.3 candidates. No record migration or permission change is required.

## 0.3.3 (first-stage performance milestone, included in 0.3.4)

- XLSX 按工作簿复用有界数字格式器池，保留日期、百分比、金额、前导零及公式缓存的显示值；不缓存单元格值。
- 搜索在同次请求内集中核验关联来源，避免按每条关联重复读取知识库；保留实际正文、重复身份、不可读及失效来源检查，不跨请求缓存事实。
- 搜索不再生成图片或 HTML 等预览，查询评分、范围、摘录、排序和结果上限保持；显式打开沿用原预览路径。
- 检索期间工作区切换会拒绝旧结果，保留现有数据格式、权限和草稿/自动保存保护。
- 本地对照中，200/50/10 场景搜索正文读取 2250→250 次，800/80/20 场景 16880→880 次；10 万格式化单元格处理 2371→805 ms，完整值哈希一致。具体条件见性能说明。
- This milestone inherited the 0.3.2 XLSX fix. Save/refresh work was completed in the following 0.3.4 stage; batched XML parsing remains deferred. Version 0.3.3 was a local validation candidate, not a separate public release.

## 0.3.2 (XLSX preview milestone, included in 0.3.4)

- 修复 xlsx 只显示附件卡片的问题，新增离线只读表格预览，支持工作表切换、分页、合并单元格、中文、前导零和基本数字/日期格式。
- 修复拖入 xlsx 被图片专用校验拒绝的问题；只为 xlsx 附件增加明确的二进制格式支持，不扩大其他文件类型或权限。
- 显示工作簿保存的公式结果，缺少结果时显示公式文本；不执行公式、外部链接或表格内容中的脚本，不改写源文件。
- 对压缩文件、解压体积、XML 与可见数据量设限，校验目录、内容长度和 CRC；损坏、加密、超限及缺少宿主读取接口时明确提示。
- 外置工作簿保留系统打开，导入附件提供原件下载。打开失败显示错误，旧文件的晚返回结果不会覆盖新选择；保留侧栏收起和既有文档流程。
- This fix was validated as a local 0.3.2 candidate and is included in 0.3.4; it was not published as a separate version.

## 0.3.1（记忆总览与可收起侧栏）

- 左上角新增收起/展开侧栏按钮，始终保留恢复入口；收起后正文占满内容区，窄窗口也不保留空白侧栏行。
- 切换只改变布局与可见性，保留当前记录、搜索、编辑草稿、进行中的自动保存、记忆预览和 HTML 页面状态。
- 支持鼠标、Enter/空格，按钮提供中英文标签及展开状态；隐藏侧栏不进入键盘焦点顺序。
- 状态在本次面板内跨标签与界面刷新保留，重新打开面板默认展开。包含下方阶段 A 的记忆总览、召回解释和受限准备诊断，保持记录格式及权限范围。

## 0.3.0（阶段 A 本地验收记录，合并到 0.3.1）

- 记忆标签默认显示只读总览，按核心规则、现有主题、未分组及待确认候选组织入口，可查看来源状态、适用范围和读取条件。
- 总览从实际记录派生，完整规则仍归原文所有；通过稳定身份打开来源，保留原有新建、确认、编辑与自动保存流程。
- 检索预览支持自动和手动两种模式，展示入选、排除及最终使用完整事实、全文入口或省略的原因，明确对应预算与快照。
- 自动准备上下文时保存本地受限诊断，每项目最多 10 条、单条最多 20 KiB，只保留哈希、修订和原因等允许字段，不保存原始查询、标题或正文。手动预览与诊断读取不写入记录。
- 诊断失败不会吞掉正常上下文；失效、取消及被新一轮替代的请求不会留下过期候选。遗忘和文件树删除记忆共用清理流程，删除前后清理相关诊断，自动写入在落盘后复核引用，失败时不报告完全遗忘。
- 保持旧工具默认结果、版本 1 记录、文档关联、首击保护、Markdown 阅读及满幅 HTML 预览；读取不迁移原始数据，权限范围不变。
- 本阶段仅实现阶段 A；替代、合并、恢复及语义检索仍未实现。上述功能随 0.3.1 提供，0.3.0 未单独公开发布。

## 0.2.2 (full-pane HTML and first-click selection)

- HTML documents, imported attachments and prototypes fill the right content pane, following the available width and height without outer card padding, borders or rounded corners.
- File actions and preview limitations are available in a compact floating disclosure instead of taking space above and below the webpage. Escape closes the disclosure.
- Long documents scroll inside the webpage. Missing-resource and preview-error notices remain visible; switching to Markdown restores normal document spacing.
- Fix first file clicks lost when panel activation rebuilt the file tree. Automatic synchronization now preserves pointer targets, current selection, editor state and unfinished memory-summary input.
- Late synchronization results are ignored after newer input, navigation, project changes or panel disposal. External file changes still synchronize on activation, and explicit refresh remains available.

## 0.2.1 (HTML preview and Markdown reading)

- Markdown documents now open in a formatted read-only view, with explicit source editing and automatic saving. New records start in editing mode.
- Added rich headings, emphasis, links, nested lists, quotes, tables, code blocks and task lists, with host-theme typography and contained horizontal scrolling.
- Returning to reading waits for the latest source input to save; in-flight inputs, failed writes and revision-conflict drafts remain protected. Linked memory summaries stay read-only.
- Markdown parsing is bundled for offline use. Source HTML stays literal; unsafe links and implicit remote image requests remain inactive.
- HTML/HTM files copied directly into the knowledge directory now display as webpages in the panel.
- Existing HTML attachments and cached records use the same preview, loading local styles, classic scripts and PNG/JPEG/WebP/GIF images on demand.
- Missing resources, read failures and preview limits are reported with system-open and file-location actions retained. The existing iframe sandbox remains in force.
- Returning from webpage interaction to the file tree no longer loses the selection to an automatic focus refresh.
- Source files, attachment types, memory data and permission scopes are preserved; preview data is never written into source records.

## 0.2.0（文档关联与任务记忆）

- 重要规则与业务知识保存为完整主题文档，记忆只保留短摘要、“何时读取”和稳定关联。
- 文档改名、移动后仍可沿关联读取当前原文；修改正文后停止使用旧摘要，重新确认可更新原关联。
- 草稿、归档、缺失、无法读取或标识冲突的文档会明确显示状态，避免把旧摘要当成当前规则。
- 面板新增确认并关联入口，记忆页可读取当前原文；关联失败会保留文档并明确提示，允许重试。
- 区分新请求识别与已存正文读取，避免因为正文包含“是否”等词而丢失整条记忆；加强上下文保存指令识别。
- 旧记录按需获得稳定标识，不做破坏性批量迁移；保留现有权限范围与文件命名方式。
- 文档身份核验不再依赖缓存筛选，明确的 `recordId` 读取避免文件名遮蔽；敏感标题不进入记忆上下文。
- 摘要草稿在输入时保留，支持同项目刷新和正文自动保存；离开时提醒，跨项目不会复用草稿。
- 按当前任务的相关性和适用路径选择已确认记忆，核心规则保留有限预算；较早的相关规则不再被最新 8 条限制排除。
- 统一自动和手动上下文的选择逻辑，完整呈现短记忆，长规则及读取条件不再截断；预算不足只保留全文入口。
- 候选草稿在确认前不进入上下文，面板可确认或停止使用；新增相对路径范围和普通/核心优先级设置。
- 修复记忆页新建记录误用知识目录的问题，旧记录无新字段时保持当前项目范围、普通优先级。

## 0.1.1（记忆质量修复）

- 区分具体事实、查询句和仅引用上文的保存指令，不再自动把“记录到记忆中”等空指令当成记忆正文。
- 对需要结合上文或超过长度限制的请求，引导 Agent 提炼具体内容并通过 `project_wiki` 保存、保留来源与确认结果，禁止以编辑 `MEMORY.md` 代替。
- 移除对不存在的 `pi.session` 的依赖；待保存内容按会话与项目隔离，新一轮输入、取消或关闭会话时不会误存旧候选。
- 自动事实在 800 字符上限内完整保存；恢复目录符号链接检查，敏感信息与空指令在创建目录前过滤。
- 按更新时间读取最新记忆，省略摘要带全文路径；旧空指令仅从注入内容排除，不自动删除原文件。
- 新增完整保存与恢复路径、空指令、查询误判、会话隔离、取消、去重与路径边界的回归测试。
- 统一使用插件中心要求的 `main.js` 入口，保持原有插件加载与业务行为，并同步打包清单和生命周期测试。

## 0.1.0（首发版本）

### 核心功能与体验重构
- **类 Obsidian 树形文件浏览器**：
  - 侧边栏常驻层级树形文件目录，替代旧版抽屉式目录；
  - 支持多级文件夹折叠/展开、空目录常驻展示、文件夹悬浮直接新建笔记 `+` 按钮；
  - 顶部增加一键“折叠/展开全部”与“刷新目录”工具按钮。
- **无感实时笔记编辑器**：
  - 详情页采用实时内嵌笔记编辑器，输入即自动防抖保存，文件实时显现在左侧目录树中；
  - 标题与正文间增加淡雅虚线分隔，紧凑优雅，移除多余弹窗流程。
- **纯中文路径与真实物理文件名**：
  - 放开文件夹分类命名限制，支持任意中文文件夹（如 `业务规划`、`设计规范`）；
  - 实现标题驱动磁盘文件重命名：文档在磁盘上直接以 `[标题].md` 真实物理命名，修改标题自动联动重命名磁盘文件，自动清洗旧版 UUID 文件。
- **全格式多媒体与办公文件原生支持**：
  - **文档**：原生支持 Markdown（`.md`）、纯文本（`.txt`）、Word 文档（`.docx`, `.doc`）、WPS 文档（`.wps`, `.wpt`）、PDF（`.pdf`）；
  - **表格**：Excel 电子表格（`.xlsx`, `.xls`, `.csv`）、WPS 表格（`.et`, `.ett`）；
  - **演示**：PowerPoint（`.pptx`, `.ppt`）、WPS 演示（`.dps`, `.dpt`）；
  - **音视频**：音频（`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`）与视频（`.mp4`, `.webm`, `.mov`），内嵌原生播放控件。
- **极速元数据与外部目录实时同步**：
  - 非 Markdown 的二进制文件不进行全文本字符串解析，基于文件系统属性秒级建立索引；
  - 外部在访达中复制或放入文件，切回软件窗口聚焦（Focus）自动触发静默对齐同步；
  - 支持拖放任意多层文件夹自动递归解析并创建对应分类目录。
- **精致矢量扁平化图标设计**：
  - 移除系统彩色 Emoji，全套采用 1px 细线矢量 SVG 图标（相框、网格表格、双音符、胶片播放器、WPS 折线、Word W 标、折角文档），完美自适应暗色与亮色模式。
- **右键上下文菜单**：
  - 笔记与文件夹右键均支持“在文件管理器中打开（定位）”；
  - 笔记支持“移动到指定目录（含新建目录）”与“删除”；
  - 文件夹右键支持“删除文件夹（级联清理）”。

### 自动化与质量保障
- 包含 27 项服务层集成与单元测试，覆盖纯中文落盘、重命名、外部文件识别及各类多媒体附件处理；
- 包含 CDP 无头真实浏览器测试与 Playwright 端到端全流程测试。
