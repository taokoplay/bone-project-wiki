# 功能验证与测试验收报告（VALIDATION）

## 0.3.5 publication preparation

- The user authorized Git submission and marketplace publication of the verified workspace-discovery repair. The account owns `bone.project-wiki`, is bound to `taokoplay/bone-project-wiki`, and version 0.3.5 is available with no pending version.
- Publication preparation updates release copy only. Executable files and host declarations must match the accepted candidate, SHA-256 `371f185f9b22363c787b803fd6dda8505fc354ee477062301d2ea099d2623d24`. Original candidate bytes and validation evidence remain preserved.
- Submit the complete host manifest and committed runtime files with a pushed source commit. The platform rebuilds the manifest; official bytes, public status and native-upgrade verification are recorded separately after actual download. Approval alone does not establish publication.
- The candidate status statements below describe the completed prepublication validation. No running user installation or user-owned knowledge project is used as a test environment.
- Release preparation reran the full 238-test suite successfully with no failures/skips/cancellations. The i18n gate has zero failures and four existing brand-title reviews. Seven explicit source, regression-test, manifest and documentation paths are included; archives, logs and user data are excluded.
- Local release-preparation package: 62 files, 516306 bytes, SHA-256 `ce2c98c337d2ef7c64a5c53508592514210addb77947b6952fba4d6a012f6c81`. All executable files and the manifest match the accepted candidate exactly; only changelog wording differs. Source parity, private-path checks and documentation links pass.

## 0.3.5 snapshot workspace-discovery repair candidate

- Confirmed 0.3.4 compatibility regression: the new operation scope treated an empty or stale optional snapshot workspace hint as an expected project. Discovery failed before initialization/save. A temporary actual-source comparison confirmed the prior 0.3.3 behavior.
- Only snapshot starts without a caller-bound workspace; the first actual host result binds the operation. Real project changes during awaits still reject. All non-snapshot public/private actions retain strict matching, permission, revision and write-readback checks.
- Six new regressions had four failures on the old implementation. The fixed full suite passes 238 tests with no failures/skips/cancellations. It covers initialized/uninitialized discovery, the registered-tool discovery/init/save/read path, queued recovery, real I/O switching, mutation/search guards and unload.
- The actual save/search browser flow and real extension loader pass. Seventy-two JavaScript files, ten Python test files, Shell syntax, documentation links and diff whitespace pass; the i18n gate has zero failures and the same four brand-title reviews.
- Candidate: 62 uncompressed files, 516297 bytes, SHA-256 `371f185f9b22363c787b803fd6dda8505fc354ee477062301d2ea099d2623d24`. Source parity, dependency closure, privacy and extracted empty-hint discovery pass. Only request-runtime executable behavior changes from official 0.3.4; other differences are version/docs.
- Isolated native official 0.3.4 to candidate 0.3.5 upgrade passes with all 62 installed hashes, preserved plugin test data and no permission difference. No user transcript, project or running installation was modified; no paid API, second dependency environment or verify:ui command was used.
- Branch `fix/wiki-snapshot-workspace-discovery` is based on main `ce261f22f6215f5528e133e67271295a7058a15f`; remote main was refreshed and remains its ancestor. The repair is uncommitted, unpushed and unpublished. Runtime deployment remains outstanding; the candidate is delivered for update, and omitting the optional workspacePath entirely is the released-version workaround.

## 0.3.4 publication preparation

- The user authorized marketplace publication of `bone.project-wiki@0.3.4`. The account owns the plugin and is bound to `taokoplay/bone-project-wiki`; the version is available and no earlier version is waiting for review.
- Publication preparation changes release documentation only. All executable files and host declarations must match the accepted 0.3.4 candidate, SHA-256 `9a5538e7a06f736cb399736c4b546339fdf2e7e4f1b3b73603800f224763458a`. The candidate and measurement records remain preserved separately.
- Submit the complete host manifest fields and committed runtime files, with the pushed source commit as `sourceRef`. The platform rebuilds its manifest; the official artifact will be downloaded and verified independently. Acceptance or review approval is not proof of public publication.
- The following sections record historical candidate validation. Public status, official bytes and upgrade verification are tracked in the separate publication delivery record. Running user installations are not used as test profiles.
- Release-preparation package: 62 files, 514031 bytes, SHA-256 `7ce7546ace8aff6b5c16ae2e13334c32b73a5c1acfa04d5dd9f50dd0e0493a22`. Exact candidate executable/manifest parity passed; only README, changelog and two contract/performance documents differ. Source parity, private-path checks and documentation links passed.
- The complete 232-test suite passed again, with no failures/skips/cancellations. The i18n gate reports zero failures and the same four existing brand-title reviews. Source submission includes 53 reviewed code, documentation and formal regression files; archives, logs and user data are excluded.

## 0.3.4 stage-two save/search candidate

- Isolated branch `perf/wiki-save-refresh-cancel`, based on the exact accepted local 0.3.3 archive. Its 193-test baseline passed. Current full Node suite: 232 passed, no failures/skips/cancellations; the 15 backend save/queue regressions also pass independently.
- Real Chrome flows passed for save/search reconciliation, external files discovered by search, Markdown, linked-memory authoring, first-click/focus, sidebar, XLSX, HTML, memory overview and first-stage performance behavior. Standalone CDP and real extension-loader fixtures passed without model calls or a user instance.
- One bounded review found an externally discovered search row could not open before a panel snapshot refresh. A real browser test reproduced the failure, then passed after current search metadata and retained row state were used. Save/rename/menu/association/pointer tests passed again after the fix. No review finding remains open.
- Five-sample real-filesystem save/snapshot medians: 200/50/10 body reads 414 to 212, index writes 3 to 1, 56.80 to 36.08 ms; 800/80/20 reads 1624 to 822, writes 3 to 1, 154.58 to 93.16 ms. Superseded-search/write sequence total body reads: 954 to 455 and 3444 to 1685; old requests cancel and the write still precedes the latest search.
- Two browser measurement series are retained, including a flat 200-document result. Final-code medians including the existing 350 ms debounce: 436.5 to 391.6 ms (200 documents), 1206.2 to 553.9 ms (800). Initial medians were 432.2 to 436.3 ms and 569.0 to 461.9 ms. Timing varies; all 20 candidate saves across both series kept editor/input identity, selection and focus.
- 71 JavaScript files, 10 Python test files, Shell syntax, manifest JSON, relative documentation links and diff whitespace passed. The i18n gate has zero failures and four existing brand-title reviews. Early pointer-test failure and flow timeouts were not counted as passing; corrected synchronization and explicit query input passed their final runs.
- Package: 62 uncompressed files, 513747 bytes, SHA-256 `9a5538e7a06f736cb399736c4b546339fdf2e7e4f1b3b73603800f224763458a`. Exact source parity, dependency closure, extracted imports and private-path checks passed. Native isolated official 0.3.1 to candidate 0.3.4 upgrade passed; all installed file hashes match, plugin data is preserved and the permission difference is empty.
- Remote main refreshed to `621f104303c28d1fd321c4997afade4a8d6a49b1`, an ancestor of source baseline `5e3a4314ce4186d5ce940db69f11dd8d81c2130e`. Implementation remains uncommitted and is fixed by the package/file hashes. No publication, user-instance installation, dependency environment, paid API or `verify:ui:*` run. Cancellation is checkpoint-based, request-local reuse is not a filesystem transaction, and large-sheet batching remains deferred. No current acceptance blocker.

## 0.3.3 首阶段性能优化候选

- 独立分支 `perf/wiki-search-and-xlsx`；以 0.3.2 固定归档 `8363e9b...a53139d` 作为功能及性能基准，原候选、其他工作区和用户资料保留。范围为 XLSX 格式器复用及搜索批量核验/跳过预览，保存刷新和进一步分批解析未实施。
- 基线 181 项 Node 测试通过。新增 12 项回归在旧实现有 9 项失败，实施后完整 193 项全部通过，无失败/跳过/取消。覆盖格式值/选项、独立工作簿、读取次数、来源新鲜度、相同元数据隐藏的身份冲突、不可读及归档来源、评分/摘录/范围、显式预览和工作区变化。
- 新增真实 `tests/performance-flow.py` 通过 2000 个格式化值、单工作簿复用和重新打开新池，以及关联记忆搜索/原文读取/原文变化后的摘要停用。既有 XLSX、记忆主流程、首击/焦点、侧栏、Markdown 和真实扩展加载器回归通过。
- 一次只读实现检查未发现实质回归。新 UI 测试曾把多词搜索当作精确短语，修正为唯一关键词后通过，产品搜索语义未改动。
- 实际源码对照：200/50/10 全库搜索 2250→250 次正文读取、187.40→25.07 ms；800/80/20 为 16880→880 次、2325.41→180.68 ms。无命中媒体查询预览读取 6→0 次、1320011→2704 字节。
- 单页面前后交替三轮，10 万格式化值构造器 100000→1，处理 2370.70→804.70 ms，完整显示值 SHA-256 一致。首个双页面脚本等待绘制帧超时，未计为通过；已检查无残留端口，改用单页静态模块对照。比较不宣称已经消除大表长任务。
- 54 个 JavaScript 文件、9 个 Python 文件、Shell 语法、文档链接和差异空白检查通过；HTML、记忆总览及独立 CDP 面板也已回归。语言检查零失败，4 项为既有品牌标题。
- 最终候选 50 文件、479844 字节，SHA-256 `0e4b9052d8f11c95d27c133ea65f8f8d627969806770f36b84d8e517811526e7`。未压缩归档、逐文件源码一致性、模块依赖与解包加载、私人路径扫描通过；没有测试、日志或用户资料。
- 临时原生宿主官方 0.3.1 → 候选 0.3.3 升级通过，插件数据保留，权限差异为空。首阶段验收无剩余阻塞；候选未提交、推送、公开发布或替换运行实例，后续保存/刷新与分批解析仍未实施。

## 0.3.2 XLSX 预览修复候选

- 基线：已发布 0.3.1 的 `5e3a431`，独立分支 `fix/wiki-xlsx-preview`。确认两个缺口：已有 xlsx 只有附件卡片、没有网格预览，拖入的 xlsx 又被图片二进制专用校验拒绝。首批四项服务回归在旧实现失败。
- 修复后 181 项 Node 测试全部通过，无失败/跳过/取消；51 个 JavaScript 文件、8 个 Python 文件与 Shell 语法、文档链接通过。新增测试覆盖原字节、64 KiB 分块边界、工作区变化、压缩/CRC/解压限制、实体拒绝、基本格式与过期视图。
- `tests/xlsx-flow.py` 真实面板 → 服务 → 临时文件系统通过：中文/共享字符串/富文本、前导零、日期、数值、合并、公式缓存与缺失、工作表/分页、外置/导入/拖入、原件下载、损坏及系统打开失败、晚返回保护、深浅主题和响应宽度。
- 项目中两份现有物料表只读验证通过，每份 155 个文本单元格与独立 openpyxl 读取一致，原文件哈希不变。样例公式及缓存日期另经 openpyxl 核验；没有写回、重算或上传用户表格。
- 一次实现检查补充的边界已通过失败用例验证并修复：工作表异常时清空旧数据及禁用分页；混合图表页保留普通数据页；搜索/导出不预读外置二进制；多工作簿附件提供选择与各自下载。
- 既有侧栏、首击/焦点、Markdown、HTML、记忆主流程、独立 CDP 面板及真实 TrustedExtensionRunner 回归通过。未使用真实模型、运行中的用户实例或第二套依赖环境，不运行 `verify:ui:*`。
- 最终候选 48 文件、471273 字节，SHA-256 `8363e9b937868fa9eb4e3c7c8f150a0be66b12af772a7f7c5cc994cf3a53139d`。归档、源码逐字节、依赖及解包加载、私人路径检查通过。临时原生宿主官方 0.3.1 → 候选 0.3.2 升级通过，插件数据保留，权限差异为空。
- 语言检查零失败，4 项为既有品牌标题。候选尚未提交、推送、公开发布或安装到运行实例。旧记录格式不变，修复验收无剩余阻塞。

## 0.3.1 市场发布准备

- 用户已授权上传 `bone.project-wiki@0.3.1`。本版合并下方阶段 A 与侧栏的已验收功能，0.3.0 和 0.2.3 本地候选不单独提交；历史验收中的“未提交/未发布”描述记录当时状态。
- 发布准备只同步说明文字，不改已验收运行代码；凭归档逐文件哈希核验，保留 171 项测试与真实面板、首击、HTML、保存和扩展加载验收证据。提交时保留正式回归测试，不纳入包、截图、日志、临时项目或凭据。
- 市场工具要求已推送的源码提交作为 sourceRef，以及完整宿主清单和除 manifest.json 外的运行文件。账号与绑定仓库已核对，0.3.1 无重复记录，语言检查保持零失败；四项既有品牌标题提示已人工核对。
- 后续市场状态、线上包哈希和下载结果通过独立回读记录，不能把本地包或审核通过等同于已经公开发布。运行中的用户实例不作自动升级。

## 0.3.1 可收起侧栏候选验收

- 用户追加要求左侧菜单可收缩；以已交付 0.3.0 的固定归档为功能基准，独立分支 `feat/wiki-collapsible-sidebar` 保存实现，原候选和其他分支未改动。
- `tests/sidebar-flow.py` 在未实现基线上因缺少可访问的侧栏开关失败，加入实现后通过真实面板 → 服务 → 文件系统验收。覆盖鼠标、Enter/空格、展开状态、隐藏侧栏退出焦点顺序、正文满幅、当前选择与搜索保留、保存中再次输入、记忆预览输入、同一 HTML iframe 的交互状态、标签切换和重新打开默认状态。
- 同一流程核验中英文按钮、深浅主题及 390/800/1280 窗口布局；展开和收起截图已查看。只切换布局，不重建编辑器、正文、记忆总览和 iframe，不写偏好或项目状态。
- 171 项既有 Node 测试全部通过，无失败/跳过/取消；真实首击/焦点刷新、满幅 HTML 以及独立 CDP 面板回归通过。43 个 JavaScript 文件和 7 个 Python 文件语法、Shell 语法、文档链接、源码差异空白与 main 祖先检查通过。
- 语言检查零失败，4 项提示为原有品牌标题。最终包 41 文件、433341 字节，SHA-256 `774e1c6ea6f56fdc80dcfefb8be38888957598124b85552f779e9063566af95e`；未压缩归档、逐文件源码一致性、模块依赖/解包加载、私人路径扫描通过。临时原生宿主 0.3.0 → 0.3.1 升级通过，权限差异为空，插件数据保留。权限与数据格式保持不变，交付无剩余阻塞。
- 本轮未运行 `verify:ui:*`、真实模型或依赖安装；未提交、推送、公开发布或替换用户运行实例。阶段 A 的核心运行时保持基准内容，B/C 仍不在范围内。

## 0.3.0 阶段 A 候选验收

- 基线：已发布 0.2.2 的 `e52e639`，独立分支 `feat/memory-overview-explain`。0.2.3 中文候选独立保留；本轮只实现阶段 A，源码未提交、推送或公开发布，运行中的用户安装未替换。
- 基准 118 项 Node 测试通过；总览、解释与诊断的首批 7 项回归先在旧实现失败。额外边界测试先复现手动用量多计 1 字符、增量查询多读正文、失效准备留下候选及诊断目录扫描边界，再修正并通过。
- 当前完整 Node 测试 171 项通过，无失败、跳过或取消；42 个 JavaScript 文件语法通过。发布前自动/手动输出的冻结哈希保持不变，手动精确 10000 字符的预算统计正确。
- 真实 `tests/memory-overview-flow.py` 通过：只读分组、来源及草稿隔离、两种预算、实际准备文本哈希、诊断无原始任务或正文、原文导航与失效、新建自动保存、较晚预览与刷新输入保护、深浅主题及响应宽度。
- 既有真实记忆流程、首击/焦点刷新、Markdown 阅读与保存、满幅 HTML 流程、独立 CDP 面板以及真实 `TrustedExtensionRunner` 加载器均通过。测试仅使用临时项目和离线事件，不调用模型。
- 受限诊断覆盖白名单、20 KiB、最近 10 条、原生符号链接拒绝、无写读取、损坏及超限文件、项目切换、取消及旧响应、遗忘清理失败。服务自动预览与扩展实际准备文本在相同任务、候选与预算下相等；诊断失败不吞正常上下文。
- 一次只读实现检查提出四项具体问题，均已有失败复现并修复：文件树删除漏清诊断、遗忘与写入交错留下引用、入选但因预算省略的合法诊断被拒、异常关联摘要的自动预览与扩展不一致。回归覆盖两种交错及空/敏感摘要配合过期/缺失来源的四种组合，不增加后续审查轮次。
- 宿主 API 已核验的限制：stat/list 不暴露链接身份，服务读取/清理只能受宿主真实路径授权和内容校验约束，不能独立拒绝所有范围内链接；优先 readRange，readText 回退的分配上限由宿主管理。原生诊断写入拒绝链接，未增加权限或绕过宿主。
- 最终包 40 文件、430121 字节，SHA-256 `5d4b8e1326b472c04dc0a5963fe5bb4cf38e2af7fee7edbd1a2b4b6daed28b03`。逐文件与源码一致、未压缩归档、模块依赖和解包加载、私人路径扫描均通过；未带入测试或临时项目。此哈希替代早期本地候选。
- 原生宿主临时配置从官方 0.2.2 升级到最终候选通过，新增 9 个运行文件逐字节匹配，权限差异为空，插件数据保留。最终真实主流程、总览及带诊断校验的扩展加载器再次通过。
- 语言检查零失败，4 项为原有固定品牌标题；6 个 Python 文件、Shell 语法、文档链接和差异空白检查通过。远端 main 已刷新，`621f104` 仍为任务基线的祖先。未运行 `verify:ui:*`、真实模型或依赖安装。
- 阶段 A 验收无剩余阻塞。阶段 B/C 未实现，没有真实模型消费证明或跨进程原子遗忘保证。源码未提交/推送，候选未公开发布，运行中的用户实例未替换。

## 0.2.2 release validation: full-pane HTML and first-click selection

- Based on published source `0fd0e6d`, isolated in `fix/wiki-full-width-html`. No user-owned document or running installation was changed.
- A real browser baseline failed before implementation: the HTML frame had 40 px margins on both sides, about 139 px above and 108 px below, plus a 1 px border and 10 px radius.
- `tests/html-flow.py` passes after the fix for raw HTML, managed attachments and prototypes. All four frame edges match the right pane within 1 px at desktop, narrow and short sizes. It also verifies internal wheel scrolling and footer interaction, compact keyboard/file actions, source refresh, missing-resource and limit notices, isolation and restored Markdown read/edit spacing.
- The headless Chrome fixture leaves room around the emulated viewport in its native window. A reduced reproduction proved that native edge clipping caused footer input to hit the owner iframe; enlarging only the native window made the same click reach the unchanged page. No application sandbox or permission setting was weakened.
- The first-click regression was reproduced with a physical mouse press, activation snapshot, then release: the previous destructive refresh removed the target and failed to open the file. `tests/focus-flow.py` now passes one-click opening, focus during a held read, late snapshots after navigation, unchanged reader/editor retention, external file updates and input during synchronization.
- `node --test renderer/focus-refresh.test.mjs html-preview.test.cjs service.test.cjs document-memory.test.cjs memory-retrieval.test.cjs extension.test.mjs`: 118 passed, zero failures or skips. Focus-sync regressions cover response ordering, project isolation, pointer/input guards, internal iframe focus, disposal and error reporting. Standalone CDP, full HTML, Markdown and memory flows passed against the combined candidate.
- The i18n gate reports zero failures and the same four pre-existing brand-title reviews. Loading, storage, Markdown and sandbox contracts are preserved; activation sync now updates in the background and keeps explicit reload separate.
- The final local release package contains 31 files and 339675 bytes, SHA-256 `dd18172f646b4f4943094a4ec061fe8953f2167cffb92817a3786b53dbc73b43`. Archive/source parity, runtime imports, private-path scans and unchanged host declarations passed. The marketplace rebuilds the manifest, so its published artifact is verified separately.
- A native host in a temporary profile upgraded published 0.2.1 to this combined 0.2.2 candidate. Plugin data was preserved, both preview and focus-sync modules were present and the permission difference was empty. The earlier preview-only candidate hash is superseded.
- The full-pane screenshot was inspected. Thirty-two JavaScript checks, Python/Shell syntax, documentation links and diff whitespace passed. No `verify:ui:*` command, paid model or dependency installation was used. Source is committed and pushed before marketplace submission; actual publication and online package verification are recorded separately after platform readback. The running user installation remains untouched.

## 0.2.1 release validation

- Based on published source `144b62f`, implemented in the dedicated `fix/wiki-html-preview` worktree. No user files or running installation were changed.
- The previous raw-HTML read path and the missing Markdown read-only view were reproduced before implementation. HTML service regressions cover discovery, warm-cache compatibility, managed attachments, local resources, traversal/remote rejection, incomplete reads, limits, derived metadata and workspace changes.
- `node --test html-preview.test.cjs service.test.cjs document-memory.test.cjs memory-retrieval.test.cjs extension.test.mjs`: 113 passed, zero failures or skips.
- `tests/markdown-flow.py`: real panel/service/filesystem acceptance passed for ordinary and managed Markdown, formatting, safe HTML/URL handling, no remote image requests, no source rewrite on read, editing/autosave/read/reload, inputs during a held save or snapshot, revision-conflict draft retention, distinct light/dark colors and responsive table/code overflow. The new read-view test failed on the original implementation.
- `tests/html-flow.py`: real browser acceptance passed for visible HTML, local CSS/JS/image decoding, buttons, source reload, imported attachments, missing-resource and limit notices, parent/network isolation, responsive layout and selection after iframe interaction.
- Existing `tests/flow.py`, standalone CDP renderer acceptance and real TrustedExtensionRunner fixture passed. They cover memory association drafts across refresh/editing, partial link retries, source navigation, stale summary withholding, scoped candidate confirmation/withdrawal and project/session guards.
- Thirty JavaScript syntax checks, Python/Shell syntax, documentation links and diff whitespace passed. The official i18n gate reported zero failures and four pre-existing brand-title reviews. Light and dark reading screenshots were inspected.
- The final local release package contains 30 files and 332261 bytes. Runtime imports, byte-for-byte source parity, bundled lexer/license integrity and private-path checks passed. Host UI declarations, permission list and filesystem scope match 0.2.0.
- Local release-package SHA-256: `02adf274b49d7cd25e807be1f5e1bd618a3aaa5a30bfe78a8ff7e395734813fd`. The plugin center rebuilds the manifest, so the published artifact is verified separately.
- A real native Host in a temporary profile upgraded the published 0.2.0 package to this candidate. The Markdown reader/lexer, HTML preview and license were present; there was no permission difference and plugin data was preserved.
- Release preparation follows the completed candidate acceptance above. Source is committed and pushed before submission; actual marketplace publication and online-artifact checks are recorded separately after platform readback. No paid model, new dependency environment or `verify:ui:*` command was used. Source HTML stays literal in Markdown, implicit remote image requests remain inactive, and the existing HTML sandbox limits remain.

## 0.2.0 文档关联与任务记忆发布验证

- 基准：已发布 `0.1.1` 的源码 `ebef0f8`，独立分支 `feat/document-memory-links`。下列为发布前源码与安装包验收，不代表运行中的插件已被替换。
- 文档关联、空指令、“是否”误过滤、缓存身份、私人标题、文件名遮蔽和草稿生命周期先建立失败基准。此次任务召回新增首批 9 个失败基准，并补充绝对路径后缀、根目录文件、损坏记忆、自动标题半句与保存竞态的回归。
- `node --test memory-retrieval.test.cjs document-memory.test.cjs service.test.cjs extension.test.mjs`：103 项通过（17 项任务召回、16 项文档关联、28 项服务、42 项扩展），无跳过。
- `tests/extension-host.mjs`：真实宿主扩展加载器覆盖任务相关性、限定范围的核心记忆、候选隔离，以及既有保存、取消、重载、文档移动和旧摘要停用，通过。
- `node renderer/browser.test.mjs`：CDP 浏览器验收通过，保留跨项目草稿隔离、项目切换冻结、关闭提醒及既有面板操作。
- `tests/flow.py` 配合真实服务：面板 → 服务 → Markdown，验证候选创建/确认/取消确认、范围与优先级持久化、保存期间取消确认仍最终落为草稿、清空关联范围后的草稿保留，以及完整文档关联/部分失败重试/原文导航/失效停用。全部通过，仅使用临时项目和明确的请求同步点。
- JavaScript 语法、Shell 语法、`git diff --check` 和官方 i18n gate 通过。i18n gate 的 4 项 review 为现有固定品牌名。
- 未运行 `verify:ui:*`，未替换运行中的插件，未调用真实模型；不将离线工具链验收描述成真实模型提炼已验证。
- 用户说明未加入个人路径或构建位置；安装包只含运行时文件。
- 实现验收时远端刷新曾因网络失败；发布准备时已刷新成功，确认 `origin/main`（`621f104`）为当前分支祖先。发布包源码由独立分支提交和远端 `sourceRef` 对应。
- 最终干净包 `bone.project-wiki-0.2.0.piplug`：23 个文件、262624 字节，逐文件与源码一致。权限及删除范围与 `0.1.1` 相同；无测试/临时文件或个人路径，解包后的入口、工具参数、服务和扩展导入通过。
- 本地包 SHA-256：`a22c57eae5e3a0d240b545ac7b97a46d3d1e9e367a5ee5519534684383a54eb9`。插件中心会重建清单，线上包哈希以发布回读结果为准。

## 0.1.1 历史验证记录

- **本轮基准提交**：`621f104`（`origin/main`），修复位于独立分支 `fix/memory-meaningful-capture`；验证结果适用于本次提交的源码。
- **本轮范围**：记忆候选的实质内容、上下文请求指引、事件生命周期与摘要读取；下方旧版功能记录不代表本轮重新执行了全部 UI 验证。

---

## 本轮记忆质量验证

用户路径：查询开发规范 → 要求“记录到记忆中” → Agent 结合上文提炼、调用 `project_wiki` 保存具体规则与来源 → 下轮加载摘要并可按路径读取全文。

- `node --test extension.test.mjs service.test.cjs`：42 项通过（14 项记忆质量测试 + 28 项服务测试）。新增首批 12 项测试在旧实现上全部失败；复查增加的无问号问题、回指变体与新结算信号用例亦先复现再修复。
- 覆盖：空指令、查询误判、最新事实优先、敏感信息过滤、完整正文与去重、会话及项目隔离、新输入清除旧候选、取消与错误结束、符号链接拒绝、旧空指令排除和摘要全文指针。
- `PI_DESKTOP_ROOT=/path/to/PI-Desktop node tests/extension-host.mjs`：使用宿主已构建的真实 `TrustedExtensionRunner` 加载插件，在临时项目验证上下文指引、结算保存、取消后新信号结算、卸载重载与下轮恢复。复用现有依赖，无真实模型、用户项目写入或第二套环境。
- JavaScript 语法检查通过。
- “结合上文”仍需要 Agent 实际提炼并执行保存工具；测试验证指引和服务写入/恢复契约，不证明真实模型必然遵从。未将纯助手输出自动提升为已确认事实。
- 本轮未运行浏览器视觉测试、`tests/flow.py` 或 `verify:ui:*`：未修改 UI，相关风险由扩展与真实文件系统、宿主加载器验证。未替换运行中的安装实例或公开发布制品。

## 0.1.0 历史功能验证记录

1. **服务层单元测试与存储集成测试（28 项全部通过）**：
   - 命令：`node --test service.test.cjs`
   - 覆盖范围：
     - 用户完整使用路径（初始化、创建、更新、冲突检查、外部编辑捕获、增量上下文、导出）；
     - 标题驱动磁盘物理文件重命名，历史 UUID 自动升级为规范中文文件名；
     - 纯中文分类目录与中文文件名磁盘真实落盘与扫描；
     - 文件夹删除（`deleteCategory`）及其下所有笔记的级联安全清理；
     - 外部直接放入的普通 Markdown 文件自动识别与标题智能推导；
     - 原生支持 Word（`.docx`）、WPS（`.wps`, `.et`, `.dps`）、PDF（`.pdf`）、音频（`.mp3`, `.wav`）、视频（`.mp4`）；
     - 派生索引重建（`reindex`）、并发修改胜出者判定与版本保护；
     - 自动记忆抓取机制、偏好隔离与敏感信息自动跳过。

2. **CDP 无头真实浏览器测试（全部通过）**：
   - 命令：`node renderer/browser.test.mjs`
   - 覆盖范围：
     - 初始化流程、实时输入自动防抖保存；
     - 历史草稿保护、工作区快速切换防写；
     - 原型沙箱 iframe 隔离、CSP 脚本权限与安全限制；
     - 树形文件目录层级展开折叠、全套 1px 细线扁平化矢量图标渲染；
     - 键盘无障碍焦点切换、深浅主题自适应及多语言渲染。

3. **Playwright 端到端全流程测试（通过）**：
   - 命令：`python3 tests/flow.py`
   - 验证真实面板 UI $\rightarrow$ 后台服务 Service $\rightarrow$ 本地 Markdown 物理落盘 $\rightarrow$ 重新加载读取的全链路。

---

## 边界与安全性验证

1. **权限最小化原则**：
   - 文件系统写范围受限于 `.bone-project-wiki/**`；
   - 文件系统删除权限受限于 `.bone-project-wiki/memory/**`；
   - 纯本地运行，不发起未经授权的外网请求，不向第三方泄露用户项目代码与笔记。
2. **原型沙箱隔离**：
   - HTML 原型仅启用 `allow-scripts` 沙箱，彻底剥离同源权限、Cookie 访问、宿主 Bridge、表单提交及外部网络跳转。
3. **输入与路径安全**：
   - 文件路径严格过滤 `/`、`\`、`\0` 及相对路径跳转（`..`），防范路径遍历攻击。

## 本轮交付包检查

- `bash scripts/pack-clean.sh`：通过，15 个运行时文件；使用已有 plugin-devkit，无依赖安装。工具仍提示现有高风险权限需宿主授权，以及入口静态扫描无法识别服务模块内的文件系统调用。
- 包内 `extension.mjs`、`core.cjs`、技能与说明文档逐字节匹配已验证源码；不含测试、验证报告或临时资料。
- SHA-256：`7a28b1e35b97653a2c9a42fcc17864057017814a1823cca64b0f0c59d19a5a8e`。
- `git diff --check`：通过。主源码工作区保持干净，修改保存在独立修复分支；未推送、替换安装实例或覆盖公开 Release。
