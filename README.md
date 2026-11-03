# BoneProjectWiki（项目知识库）

适用于 PI-Desktop 的本地优先（Local-first）项目知识库与资产管理插件。包含用户私有的通用项目知识库、Agent 自动协作记忆层、HTML 原型沙箱以及全格式媒体与文档资产管理。

---

## 核心特性

- **类 Obsidian 层级文件树**：左侧树形目录导航，支持文件夹无极层级折叠展开、新建目录、折叠/展开全部、快速刷新。
- **无感实时笔记编辑器**：右侧实时在线笔记编辑，采用防抖自动保存技术；标题与磁盘物理文件名（`[标题].md`）实时双向联动，纯中文路径与文件名真实落盘，无 UUID 乱码。
- **全格式文件与多媒体支持**：
  - **文档**：原生 Markdown（`.md`）、纯文本（`.txt`）、Word 文档（`.docx`, `.doc`）、WPS 文档（`.wps`, `.wpt`）、PDF（`.pdf`）。
  - **表格**：Excel 电子表格（`.xlsx`, `.xls`, `.csv`）、WPS 表格（`.et`, `.ett`）。
  - **演示**：PowerPoint（`.pptx`, `.ppt`）、WPS 演示（`.dps`, `.dpt`）、Keynote（`.key`）。
  - **多媒体**：图片（`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`）、音频（`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`）与视频（`.mp4`, `.webm`, `.mov`），内嵌原生播放与大图预览。
- **外部目录实时同步**：支持直接从操作系统访达（Finder）或文件资源管理器将文件/多层文件夹直接拖入或拷入，窗口聚焦自动静默同步。
- **扁平化矢量图标**：全套采用精致单色 1px 细线矢量 SVG 图标，自动适配亮色与暗色模式。
- **Agent 协作记忆层**：智能识别并在轮次结算后自动捕获用户明确的偏好设定、关键决策与持久事实，在下一轮对话开始时预算式轻量注入上下文。

---

## 源码与打包构建

- **标准源码路径**：`/Users/xutaoyu/CodeSource/PI-Plugins/bone-project-wiki`
- **插件标识符**：`bone.project-wiki`
- **构建命令**：在插件根目录运行 `bash scripts/pack-clean.sh`，生成生产安装包：
  `dist/bone.project-wiki-0.1.0.piplug`

---

## 安装与使用流程

1. **安装插件**：
   - 打开 PI-Desktop，进入插件管理后台（点击左下角插头图标 🔌）；
   - 点击右上角菜单“从安装包安装插件...”，选取生成的 `.piplug` 文件安装。
2. **初始化知识库**：
   - 在左侧侧边栏或顶部导航打开 **BoneProjectWiki**；
   - 点击“初始化知识库”，即可在当前项目目录下创建标准 `.bone-project-wiki/` 知识库目录结构。
3. **日常记录与整理**：
   - 在右侧直接输入标题与内容，系统自动保存并实时在左侧目录树生成对应的 `.md` 文件；
   - 支持右键点击笔记或文件夹进行：**移动到…**、**在文件管理器中打开**、**删除**；
   - 拖拽任意多层文件夹或文档进入面板，自动递归解析并创建对应分类目录。

---

## 数据格式与便携性

知识库所有数据均保存在项目根目录的 `.bone-project-wiki/` 下，具备高度的可移植性：

```text
.bone-project-wiki/
├── project.json              # 项目知识库配置与版本元数据
├── index.json                # 类似 Git index 的轻量派生缓存索引
├── knowledge/                # 用户拥有的通用知识库
│   ├── general/              # 默认通用分类（支持任意中文自定义目录）
│   │   ├── 需求设计方案.md     # 纯中文 Markdown 笔记文件
│   │   └── 产品原型.png       # 真实图片与多媒体资产
│   └── 财务资料/              # 用户自定义分类目录
│       └── 预算报表.xlsx      # 办公文档与表格附件
└── memory/                   # Agent 自动捕获的项目协作记忆
    └── index.json
```

- **索引缓存机制**：知识库通过派生的 `index.json` 记录文件的大小（size）和修改时间（mtime）。只有真正发生变动的文件才会触发重新读取，千条记录扫描秒级完成。如果删除 `index.json`，下一次加载会自动全量重新扫描生成，绝不丢失任何数据。
- **版本冲突保护**：保存时严格比对内容 Hash 与版本修订号（Revision），防止外部并发修改造成内容覆盖。

---

## Agent 工具契约（API）

通过 `project_wiki` 工具调用，格式示例：

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
`snapshot`, `init`, `read`, `save`, `import`, `search`, `context`, `export`, `move`, `delete`, `deleteCategory`, `reveal`, `openDefault`, `preferencesGet`, `preferencesSave`, `forget`, `reindex`。

---

## 验证与测试运行

在插件根目录下运行全套质量门禁：

```bash
# 运行全部 27 项服务层集成与单元测试
node --test service.test.cjs

# 运行 CDP 真实浏览器无头测试
node renderer/browser.test.mjs

# 启动测试服务并运行 Playwright 端到端流程测试
node tests/flow-server.cjs &
python3 tests/flow.py
```
