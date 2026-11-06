# 阶段 A 实现契约

状态：阶段 A 已完成本地验收，随 0.3.1 准备发布；本文件固定接口，不开放阶段 B/C 写入能力。基线为已发布 0.2.2（`e52e639`），0.3.0 仅作本地验收记录，0.2.3 中文候选独立保留。提交与发布按用户的市场上传授权执行，运行实例不会自动替换。

## 对外只读动作

- `memoryOverview` 返回 `{schemaVersion:1, entries, groups, counts}`。
- `context` 保留旧默认 `{text}`。新增可选 `explain:boolean`、`memoryMode:'automatic'|'manual'`；默认手动，显式自动模式返回自动预算的检索预览。仅 `explain:true` 增加 `explanation`，不写文件。
- `memoryTraces` 返回 `{schemaVersion:1,traces,warnings}`；读取不持久化新数据，不声称模型已消费。
- `snapshot.memoryCapabilities` 声明版本、总览、解释、模式和诊断读取能力。没有声明的旧快照仍走原流程。
- 新动作纳入工具只读名单。所有请求仍使用 `snapshot` 返回的工作区。不会增加宿主权限。

## 总览模型

`entries` 每条包含：

- `key`：`sha256(JSON.stringify([kind || 'memory', id || path || '', category || 'memory']))`。
- `id`、`title`、`revision`、`status`（`confirmed/draft/archived/unreadable`）。
- `sourceState`：`standalone` 或现有 `current/stale/draft/archived/missing/unreadable/ambiguous` 来源状态。
- `importance`、完整的 `scopePaths`、`topics`。
- `summaryMode`：`fact/pointer/unavailable`。只有确认、可用、来源当前的完整正文不超过 800 字符时，`summary` 才包含完整事实；其余为空。
- 可选 `source:{recordId,title,revision,status}`，来自实际核验的知识原文；不携带任意绝对路径。
- `readWhen` 读取条件只使用核验/过滤后的值。实际正文读失败时不沿用缓存范围、优先级或事实。

`groups` 为 `{id,type,topic?,keys}`，`type` 为 `core/topic/ungrouped/candidates`；复用已有 `topics`，无主题的有效旧记忆归入未分组，草稿进入待确认，归档不混入有效分组。一个记录可在多个分组有入口。`counts` 包含 `total/confirmed/draft/archived/unavailable`。

总览不改变数据或确认状态。普通记忆通过 `id` 打开，原文通过 `recordId` 打开。

## 解释模型

`explanation` 包含：

```text
schemaVersion: 1
selectionVersion: 1
mode: automatic | manual
budget: {maxChars, maxEntries, maxBodyChars, scope}
usedChars: 预算内实际输出的字符；手动为内容块及块间换行，不含提示前缀
textChars: 最终 text 的实际字符数
contextHash: 最终 text 的 SHA-256
snapshotHash: 候选身份/修订/来源状态的 SHA-256
counts: {total, eligible, selected, facts, pointers, omitted}
decisions: [...]
```

自动预算为 1200/6/180，`scope:'whole_context'`；手动为 10000/16/1800，`scope:'content_blocks'`，保留手动既有提示前缀不计入内容预算的行为。同一候选快照、查询/路径和预算下解释须与实际输出一致。`usedChars` 用于预算展示，不能用 `textChars` 冒充预算消耗。

每条 decision 为 `{key,id,title,status,revision,sourceState,sourceRevision,score,matchedFields,coreReserved,eligible,selected,rank,presentation,reasons}`。`rank` 为入选顺序（从 1 开始）或 null；`presentation` 为 `fact/pointer/omitted`。没有正文；标题经过过滤。解释包括拒绝原因而不把草稿正文带入结果。

原因代码：`not_memory, unreadable, draft, archived, sensitive, request_only, empty, invalid_metadata, scope_mismatch, not_relevant, entry_limit, core_reserved, relevance_match, recent_fallback, source_current, source_stale, source_draft, source_archived, source_missing, source_unreadable, source_ambiguous, body_limit, budget_limit, no_read_route`。

## 自动准备记录

扩展取得同一解释后在 `before_agent_start` 保存受限诊断；仍返回同一 context 文本，不能因诊断失败而吞掉安全的上下文。存储原始解释的行为被禁止。

持久化允许字段：版本、随机 `traceId`、会话键的 SHA-256、`preparedAt`、模式/预算、字符数、上下文及候选哈希、计数、`detailsOmitted`，以及 decision 的 `key/revision/sourceRevision/score/coreReserved/eligible/selected/rank/presentation/reasons`。不得保存 `id/title/paths/topics/query/content/text/source` 或未声明字段。未知版本、非枚举原因、无效哈希和超限输入必须拒绝。

每条最多 20 KiB，每项目最近 10 条；超限裁掉 decision 明细并保留真实计数与 `detailsOmitted`。原生写入使用原子单文件替换，拒绝目录/文件符号链接、路径穿越及过期/取消任务；写入时清理旧诊断，读取保持只读。操作目录为 `.bone-project-wiki/memory/recall-traces/`。宿主 API 的 stat/list 不提供链接身份，服务读取与清理只能按宿主真实路径权限、文件名及内容校验，不能声称能独立拒绝所有范围内链接；优先 `readRange` 限量读取，旧宿主的 `readText` 回退受宿主分配上限约束。

Node 扩展写入与宿主 API 读取分离。服务不得直接引入原生 fs 模块来绕过宿主权限。内部模块接口如下：

- `memory-diagnostics.cjs`（主实现负责）导出 `memoryKey`、`REASON_CODES`，以及解释生成逻辑。
- `memory-files.mjs`（存储实现负责）从当前 `memory-context.mjs` 原样提取 `safeDirectory/readSafe/sameFile/missing`，保留错误代码；主实现随后让记忆读取器复用它。
- `recall-traces.cjs`（存储实现负责）导出 `makeRecallTrace(explanation,{sessionId,now?})`、`validateRecallTrace(value)`、`readRecallTraces(api,workspacePath)`、`purgeTraceReferences(api,workspacePath,key)`。`api` 形如现有 `pi`，包含 fs/workspace；每次异步调用前后核对工作区。读取返回上述 `{schemaVersion,traces,warnings}`，警告为不含正文/路径的原因代码数组。
- `recall-trace-storage.mjs` 导出 `writeRecallTrace(cwd,explanation,{sessionId,signal,isCurrent?,validateReferences?,now?})`，复用安全文件助手，使用 allowlist 编码；`validateReferences` 仅作本地落盘后的存在性复核，不持久化路径。引用已删除时撤回本次持有的诊断，过期上下文不再返回。目录不存在时在现有 wiki 根下创建；无 wiki 根则不初始化真实知识库。
- `memory-removal.cjs` 的 `forgetMemory(service,input)` 共用于 `forget` 和文件树记忆删除，删除前清理诊断并复核修订，核验删除后再次清理。与写入的落盘后引用复核配合，覆盖已验证的两种交错顺序；不是跨进程事务。损坏诊断只允许原生写入器核验 inode 后裁剪，服务无法核验时失败，不声称完全遗忘。

## Renderer 组件接口

新建 `renderer/memory-overview.mjs`，导出 `createMemoryOverview(t,{load,onOpenMemory,onOpenSource,onNew,isCurrent}) -> {element,refresh}`。

- `load(action,payload={})` 调用上述真实服务，组件不自行写入或读取文件。
- `onOpenMemory(id)`、`onOpenSource(recordId)` 由主界面接入已有导航；`onNew()` 使用原编辑器。
- `isCurrent()` 与 `element.isConnected` 在 await 后共同阻止旧视图响应；组件自己的刷新/预览请求另有代次，旧响应不能覆盖新输入。
- `refresh()` 保留查询、路径、过滤和模式输入，更新总览与诊断。旧解释需显示快照/版本变化或重新请求，不能悄悄冒充当前结果。
- 记忆标签无当前记录时默认总览，新建入口仍进入编辑器。记录详情可返回总览。主界面负责接线，不把业务工作流继续堆入 `app.mjs`。
- 继续采用宿主 tokens、两主标签和文件树，无原生 select。0.3.1 按用户追加要求提供侧栏收起/展开，保留总览与编辑状态。中英文文案均使用 i18n。独立样式文件 `renderer/memory-overview.css`，主实现负责 index.html/pack 引入。
- 检索解释可切换自动/手动，手动预览与“最近准备记录”分开展示。输入名称 `memoryQuery/memoryPaths`，模式控件 `data-select='memoryMode'`。诊断通过 key 联结当前总览，修订不同标注已更新，已删除/不可读条目不显示旧事实。

## 实现与验收边界

阶段 B/C 的替代、合并、恢复、模型调用不在本轮实现；新总览不会自动迁移或确认资料。服务单元/契约、真实扩展加载器、真实面板/服务/临时文件系统流程覆盖总览、两种预算、候选/来源状态、诊断隐私容量、过期结果与原编辑流程。产品测试不使用真实用户数据，安装验证使用临时配置。
