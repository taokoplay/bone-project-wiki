# 项目知识库（BoneProjectWiki）

适用于 PI-Desktop 的本地优先（Local-first）项目知识库与资产管理插件。包含用户私有的通用项目知识库、Agent 自动协作记忆层、HTML 原型沙箱以及全格式媒体与文档资产管理。

---

## 核心特性

- **可收起的层级文件树**：左上角按钮可收起或展开整个文件侧栏，收起后内容占满可用空间。支持多级文件夹、新建目录、折叠/展开全部和快速刷新；保留搜索、当前选择及编辑内容。开关状态在本次面板内保留，重新打开面板时默认展开，支持 Enter/空格操作。
- **Markdown reading and source editing**: existing notes open as formatted read-only documents. Use **Edit record** to edit the source with automatic saving; **Read mode** waits for the latest save before showing the formatted result. New records start in editing mode. Titles continue to determine their Markdown filenames.
- **全格式文件与多媒体支持**：
  - **文档**：原生 Markdown（`.md`）、纯文本（`.txt`）、Word 文档（`.docx`, `.doc`）、WPS 文档（`.wps`, `.wpt`）、PDF（`.pdf`）。
  - **表格**：Excel 电子表格（`.xlsx`, `.xls`, `.csv`）、WPS 表格（`.et`, `.ett`）。
  - **演示**：PowerPoint（`.pptx`, `.ppt`）、WPS 演示（`.dps`, `.dpt`）、Keynote（`.key`）。
  - **多媒体**：图片（`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`）、音频（`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`）与视频（`.mp4`, `.webm`, `.mov`），内嵌原生播放与大图预览。
- **External file synchronization**: activating the panel checks external changes in the background without replacing an active click target or clearing the current selection. Editing and unfinished memory-summary input remain intact. Use the tree refresh button for an explicit reload.
- **扁平化矢量图标**：全套采用精致单色 1px 细线矢量 SVG 图标，自动适配亮色与暗色模式。
- **Agent 协作记忆层**：在轮次结算后保存用户明确表达的具体偏好与事实；需要结合上文的记忆请求由 Agent 提炼后通过工具保存，下一轮以有篇幅限制的摘要与全文路径提供参考。

---

## 使用指南

1. **初始化知识库**：
   - 打开项目知识库面板；
   - 点击“初始化知识库”，即可在当前项目目录下创建标准 `.bone-project-wiki/` 知识库目录结构。
2. **日常记录与整理**：
   - Create a record and enter its title and source; automatic saving creates the Markdown file in the tree. Existing records open in read-only mode with an explicit edit action;
   - 支持右键点击笔记或文件夹进行：**移动到…**、**在文件管理器中打开**、**删除**；
   - 拖拽任意多层文件夹或文档进入面板，自动递归解析并创建对应分类目录。
3. **打开与查看各类资产**：
   - Markdown notes display formatted headings, emphasis, nested lists, quotes, tables, code and task lists. Read/edit switching preserves revision checks, pending input and conflict drafts. Linked memory summaries remain read-only;
   - 图片自适应大图查看；音频与视频直接在右侧面板内嵌原生控件播放；
   - HTML/HTM files, existing HTML attachments and prototypes fill the right pane. The page follows its available width and height and scrolls internally; file actions and preview information are available from the small floating menu, without a surrounding card or repeated file heading;
   - 页面可使用内联样式、普通脚本及目录内引用的 CSS/JS 和 PNG/JPEG/WEBP/GIF 图片。预览为隔离环境，远程请求、模块脚本、子页面嵌入、表单提交和弹窗仍不支持；
   - 预览最多读取 100 个文件、合计 10 MB；缺失资源或无法读取会提示，并保留系统浏览器打开入口。原文件不会被转换或覆盖；
   - Word、WPS、Excel、PDF 等办公文档提供一键“在系统中打开”与“在访达中定位”。

Markdown rendering runs fully offline and follows the host theme. Source HTML is displayed as text; relative/remote images show alternative text without automatic file or network requests. See [Markdown reading and editing](docs/markdown-view.md) and [third-party licenses](THIRD_PARTY_LICENSES.md).

## 记忆如何生效

- **具体事实**：例如“请记住：本项目布局统一采用 PinLayout”，可在本轮结束后自动保存到当前项目的记忆目录。
- **结合上文**：例如“记录到记忆中”“把刚才的开发规范记住”，会提示 Agent 从当前对话提炼具体内容、保留来源，并通过 `project_wiki` 保存。工具确认成功前不能声称已记录；缺少上文或工具时需说明未保存。
- **避免空记忆**：查询句、单独的记录指令、密码与密钥等内容不会自动当成事实保存。旧的空指令记录不会继续进入对话摘要，但原文件不会被自动删除。
- **可追溯且不截断规则**：短记忆完整呈现；超出单条或总预算时仅提供全文读取入口，不输出被截断的规则、例外或读取条件。
- **范围与限制**：记忆属于当前项目，作为参考数据使用。自动捕获使用本地规则，不会自动理解所有自然语言或把全部助手回复作为已确认事实保存；超过长度限制的显式请求交给 Agent 提炼，避免截断事实。
- **按任务选择**：自动读取与手动上下文共用确认状态、路径范围、相关性和时间排序；较早的相关规则不再受“最新 8 条”限制。泛指“继续开发”时仍可读取近期已确认记忆。
- **候选隔离**：记忆草稿保留在面板，确认前不进入自动或手动上下文。编辑记忆时可展开“适用范围与优先级”，勾选内容已确认；取消确认后停止用于后续任务。
- **范围与核心规则**：范围留空表示当前项目，填写项目相对路径可限定到模块；任务须明确涉及匹配路径才会使用。核心规则在其适用范围内保留有限预算。

### 查看记忆总览与召回解释

0.3.1 在“记忆”标签提供只读总览，沿用两主标签和可收起的左侧文件树。核心规则、现有主题、未分组记录与待确认候选分别提供入口；可查看确认状态、来源是否最新、完整适用范围及“何时读取”。总览由实际记录派生，完整规则继续保存在原文，原文无法核验时不沿用缓存中的旧事实。新建与编辑仍使用原有自动保存流程。

在“召回预览”输入任务与可选的项目相对路径，选择自动或手动模式后检索。结果区说明每条记忆是否适用、为何入选，以及最终提供完整事实、全文入口或省略。自动模式为 1200 字符、最多 6 条、单条正文 180 字符；手动模式的内容块为 10000 字符、最多 16 条、单条记忆正文 1800 字符，其原有提示前缀不计入内容块预算。两种模式的结果应结合各自预算比较，不能直接视为同一次召回。

“最近准备记录”只表示扩展已生成过自动记忆上下文，不能证明模型收到、读取或遵守。每项目保留最近 10 条，单条不超过 20 KiB；仅保存哈希、修订、计数与允许的原因代码，不保存原始查询、标题、正文或路径。手动预览和查看记录不会新增诊断；诊断保存失败会提示并保留正常上下文。遗忘或从文件树删除记忆共用清理流程，删除前后核对相关诊断；自动写入在落盘后复核引用是否仍存在。清理失败不会报告完全遗忘。

本版的记忆改造包含阶段 A。替代、合并、恢复和语义检索仍未实现；旧版记录继续可读，查看总览不会批量改写或自动确认资料。安装或更新请使用插件市场中已公开的版本。

## 重要规则如何关联记忆

重要的规则、业务流程和例外条件保存在完整主题文档中；记忆只保留简短摘要、适用场景及原文关联。

1. 在知识库打开已保存的文档，展开“将文档关联到记忆”。
2. 填写“简短记忆摘要”和“何时需要读取完整文档”，核对内容后确认并关联。
3. 在“记忆”中查看摘要，点击“读取当前原文”可返回完整文档。

文档改名或移动后关联仍保留。正文修改后，旧摘要标为待更新并停止注入；读取新原文后重新确认摘要，会更新同一条关联。草稿、归档、原文缺失或无法核验时，面板会明确提示，不会自动沿用旧规则。文档已保存但关联失败时，会保留文档和面板中的摘要草稿，可重试完成关联。

摘要输入会随同项目刷新和正文自动保存保留；切换项目时不会带入其他项目的草稿。敏感标题不会进入记忆上下文，身份冲突会停止使用摘要并提示核对原文。

简单偏好仍可直接保存为短记忆。完整文档与摘要都是项目参考资料，当前用户指令仍优先；记录上限和权限边界保持不变。

Agent 保存记忆或关联文档时，可传 `scopePaths`（最多 16 个项目相对路径）和 `importance: "normal" | "core"`；更新时省略会保留已有设置，空数组清除路径限制。读取任务上下文使用 `context` 的 `query` 和可选 `paths`。这些字段不改变文件访问权限。

---

## 数据格式与便携性

知识库所有数据均保存在当前项目根目录的 `.bone-project-wiki/` 下，具备高度的可移植性：

```text
.bone-project-wiki/
├── project.json              # 项目知识库配置与版本元数据
├── index.json                # 类似 Git index 的轻量派生缓存索引
├── knowledge/                # 通用知识库
│   ├── general/              # 默认通用分类（支持任意中文自定义目录）
│   │   ├── 需求设计方案.md     # 纯中文 Markdown 笔记文件
│   │   └── 产品原型.png       # 真实图片与多媒体资产
│   └── 财务资料/              # 用户自定义分类目录
│       └── 预算报表.xlsx      # 办公文档与表格附件
└── memory/                   # Agent 自动捕获的项目协作记忆
    ├── index.json
    └── recall-traces/        # 自动上下文准备诊断，按上限保留
```

- **索引缓存机制**：知识库通过派生的 `index.json` 记录文件大小和修改时间，减少普通列表的重复读取。记忆召回在现有数量和字节上限内核验实际记忆正文，文档关联还会核验来源身份与正文，避免缓存掩盖范围变化或来源冲突。删除索引后可从原文件重建，原始记录仍保留。
- **版本冲突保护**：保存时严格比对内容 Hash 与版本修订号（Revision），防止外部并发修改造成内容覆盖。

---

## Agent 工具契约（API）

AI Agent 可通过 `project_wiki` 工具安全管理与检索当前项目的知识库：

```json
// 获取知识库快照
{ "action": "snapshot" }

// 保存或更新记录（修改标题将同步触发物理重命名）
{
  "action": "save",
  "workspacePath": "/path/to/project",
  "title": "退款规则说明",
  "category": "业务规范",
  "kind": "document",
  "status": "confirmed",
  "content": "# 退款规则说明\n\n部分退款不能超过实付金额。"
}

// 增量获取最近更新的上下文
{
  "action": "context",
  "workspacePath": "/path/to/project",
  "since": "2026-11-01T00:00:00Z"
}
```

支持的操作（Actions）：
`snapshot`, `init`, `read`, `save`, `remember`, `import`, `search`, `context`, `memoryOverview`, `memoryTraces`, `export`, `move`, `delete`, `deleteCategory`, `reveal`, `openDefault`, `preferencesGet`, `preferencesSave`, `forget`, `reindex`。`deleteCategory` 与 `openDefault` 仍是面板兼容动作。

`memoryOverview` 返回派生分组和条目。`context` 默认继续仅返回 `{text}`；显式传 `explain: true` 才增加解释，`memoryMode` 为 `automatic` 或 `manual`，默认手动。`memoryTraces` 只读准备记录。先用 `snapshot.memoryCapabilities` 判断能力，继续使用其当前 `workspacePath`。增量 `context.since` 保持元数据查询，不能与解释或显式模式组合。
