# 功能验证与测试验收报告（VALIDATION）

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
