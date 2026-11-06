# 更新日志（CHANGELOG）

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
