# 首阶段性能优化

The sections below record the completed 0.3.3 first stage and its measurements. Version 0.3.4 additionally implements save/refresh reuse and latest-search cancellation, defined in the [stage-two contract](operation-stage-two-contract.md). Statements about deferred save/refresh work below describe the earlier stage; Worker and batched XML parsing remain deferred.

0.3.3 候选继承 0.3.2 的 XLSX 展示修复，落地两项已经测量确认的优化：工作簿内复用数字格式器，以及搜索内批量核验来源、跳过无用预览。未包含大目录保存/刷新、旧请求合并、Worker 或分批 XML 解析。

## 数字格式器

`renderer/xlsx-values.mjs` 将原有转换规则保留在同一函数中，`createValueFormatter()` 为每个工作簿创建有界池，最多 32 项。键只包含数值格式选项，不包含单元格值、标题、工作簿路径或任意样式字符串；工作簿的多个工作表可复用，重新打开时得到新池。独立 `formatValue` 入口也保留，并使用有界池。

日期系统、金额符号、百分比、分组、小数位、前导零、公式缓存与缺失、合并和源字节保持原有规则。缓存不存储格式化后的值，也不改变数字精度或公式执行方式。

## 搜索读取

`search-records.cjs` 负责搜索工作流，服务仅接线。每个搜索单独创建正文读取表，实际读取和解码的正文只在该请求内复用。`DocumentMemories.documents()` 仍是来源核验的共用入口，通过内部读取回调复用本次已读取的文档。

- 搜索不生成图片、音视频、PDF 或 HTML 预览；显式打开仍使用原预览路径。
- 每个来源候选仍按实际正文核验身份、状态及内容，归档、损坏和不可读候选继续参与必要的来源判定；大小/mtime 不能替代正文核验。
- 重复身份、过期、草稿、归档、缺失或不可读来源不能提供旧摘要。
- 查询拆词、评分、摘录、跨分区范围、排序、归档过滤和最多 80 条结果保持；没有把搜索改为仅限当前标签。
- 内部正文缓存不跨请求、项目或会话持久化。它不是文件系统事务；检索期间的外部修改通过后续搜索/刷新再次核验。工作区变化或卸载会拒绝旧结果，最后一个正文读取失败也不能吞掉项目切换错误并返回旧数据。
- 请求结束后不继续保留正文读取表，现有资料库数量、容量和宿主权限边界保持。

## 实际前后对照

基准是固定的 0.3.2 验收包，候选使用实际修改后的源码。服务使用临时项目、真实本地文件系统及 Plugin API 适配器；搜索计时通常取 3 次中位数，不包含真实宿主跨进程通信成本。表格在同一 Chrome 页面前后交替 3 轮，处理相同的 10 万个单一格式数值，完整显示值哈希一致。

| 场景 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 200 文档、50 记忆、10 关联：全库搜索正文读取 | 2250 次 | 250 次 |
| 同场景服务耗时中位数 | 187.40 ms | 25.07 ms |
| 800 文档、80 记忆、20 关联：全库搜索正文读取 | 16880 次 | 880 次 |
| 同场景服务耗时中位数 | 2325.41 ms | 180.68 ms |
| 无命中媒体搜索：图片预览读取 | 6 次 | 0 次 |
| 同查询读取总字节 | 1320011 | 2704 |
| 10 万格式化单元格：新建数字格式器 | 100000 | 1 |
| 同工作簿及首表处理耗时中位数 | 2370.70 ms | 804.70 ms |

该表格场景耗时减少 66.1%，完整显示值 SHA-256 为 `058cdb2c192da3a41f6474178b798ec98eae3508ef2448cb419766570b4a15ed`。这些是本地合成数据的结果，不是所有真实工作簿或设备的性能承诺。

大表仍有 XML 解析和单元格遍历成本。此次计时不能证明主线程阻塞已经消除；分批解析和大目录保存/刷新仍需下一阶段处理。所有读取上限、取消/视图保护和数据安全规则继续适用。

## 回归

新增回归先在基准失败，实施后完整 Node 套件通过 193 项。覆盖格式选项复用、工作簿隔离、值一致性、请求内读取次数、媒体预览隔离、原文变化、未变化元数据中的身份冲突、不可读候选、归档来源、评分和工作区切换。

`tests/performance-flow.py` 从真实面板进入，验证 2000 个格式化单元格、每次打开独立池，以及“搜索关联记忆 → 读取当前原文 → 原文变化后停止匹配旧摘要”的完整路径。既有 XLSX、记忆、首击、侧栏、Markdown、HTML 与扩展加载流程按验证报告回归。

The first-stage 0.3.3 validation candidate was not published separately; its changes are included in 0.3.4. No host permissions, record migration or additional dependency environment are required.

## Stage two: save and latest search (0.3.4)

The panel combines save and its full snapshot in one FIFO operation. Actual body reads and scans may be reused only within this operation, while final revision guards, target collision checks and write readback bypass reuse. Derived index rows are compared before writing; unchanged metadata does not cause an index rewrite. Ordinary saves retain the live editor nodes, input, selection and focus, and reconcile the tree without rebuilding the shell.

Temporary aged fixtures with 200 documents/50 memories/10 links reduced save plus snapshot body reads from 414 to 212, and the 800/80/20 fixture from 1624 to 822. Each changed save wrote one index instead of three. Five-sample local service medians were 56.80 to 36.08 ms and 154.58 to 93.16 ms. These timings exclude host IPC and are not a device-wide latency promise.

Latest panel searches use a bounded client generation registry. Superseded queued searches are removed, running reads stop at their next checkpoint, and already queued writes keep their FIFO position. Cancellation does not reverse an OS operation already in progress. Public tool searches remain independent; absence of advertised capabilities uses the compatible save/search path.

The full snapshot remains source-verified. A committed save followed by a refresh failure retains the actual saved revision and reports partial success, so newer input can retry safely. Tests cover external same-size/mtime edits, target creation races, actual readback failures, partial refresh, cancellation order, client/project isolation and disposal. Real panel flows cover editor identity, held pointer targets, source-summary drafts, renamed menus and external files discovered by search. No record format, permission or memory budget change is required.
