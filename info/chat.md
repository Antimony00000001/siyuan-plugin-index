# 📂 当前代码结构与功能详述 (Current Codebase Analysis)

## 1. 核心入口与配置 (Core & Config)

*   **`src/index.ts` (Entry Point)**
    *   **角色**: 插件主类 `IndexPlugin`。
    *   **职责**:
        *   生命周期管理 (`onload`, `onunload`)。
        *   初始化各个模块 (`initTopbar`, `settings`, `eventBus`)。
        *   注册全局事件监听：
            *   `click-blockicon` -> `buildDoc` (文档构建器菜单)。
            *   `loaded-protyle-static` -> `updateIndex` (自动更新目录)。
*   **`src/settings.ts` (Configuration)**
    *   **角色**: 全局配置中心。
    *   **职责**:
        *   `SettingsProperty` 类：定义所有配置项（depth, listType, autoUpdate, insertionMode 等）。
        *   `Settings` 类：负责配置的加载、保存、持久化到磁盘。
*   **`src/topbar.ts` (UI Registration)**
    *   **职责**:
        *   注册顶部栏图标。
        *   注册快捷键命令 (`addCommand`)。
        *   管理顶部栏右键菜单 (UI 交互)。
        *   **主要功能入口**:
            *   `insert()`: 插入目录 (快捷键 `⌥⌘I`)，内部根据 `insertionMode` 分发逻辑。
            *   `insertDocButton()`: 插入大纲 (快捷键 `⌥⌘O`)。

## 2. 核心业务逻辑 (Business Logic - Creater)

这是代码最重、逻辑最复杂的部分，主要位于 `src/creater/` 目录。

*   **`src/creater/createIndex.ts` (The Monolith - 核心巨石)**
    *   **核心功能**: 负责生成目录和大纲的 Markdown 文本，并执行插入/更新操作。
    *   **关键函数**:
        *   `insert(targetBlockId)`: 顶部栏/斜杠命令入口，根据配置分发到子功能。
        *   `createIndex(...)`: **递归**生成子文档目录（Index）。支持深度控制、图标处理。
        *   `insertOutline(...)`: **递归**生成文档大纲（Outline）。处理标题提取、Blockquote 包装 (`> `)。
        *   `insertData(id, data, type)`: **核心数据持久化函数**。
            *   负责将生成的 Markdown 写入数据库。
            *   **智能属性绑定**: 对于 Outline (Blockquote 结构)，它会自动寻找内部的 List 块并绑定 `custom-outline-create` 属性。
            *   **自动修复**: 更新时如果发现属性错绑在 BQ 上，会自动修复绑定到内部 List。
            *   **防抖**: 使用 `sleep` 循环重试机制解决 DB 延迟问题。
        *   `insertAuto` / `insertOutlineAuto`: **自动更新**逻辑。
            *   检查 `custom-*-create` 属性。
            *   **智能锚文本保留**: 提取现有 Markdown 中的锚文本，保留用户自定义的分隔符（过滤掉长标题），防止覆盖。
*   **`src/creater/createnotebookindex.ts` (Notebook Index)**
    *   **职责**: 生成笔记本级别的目录。
    *   **逻辑**: 复用了 `createIndex.ts` 中的 `createIndex` 函数，实现了**全笔记本递归**生成。
    *   **交互**: 包含 `NotebookDialog` 弹窗逻辑。

## 3. 文档构建器 / 智能列表 (Smart List Sync)

位于 `src/event/` 目录，提供了一套独立的“双向同步”机制。

*   **`src/event/process-list.ts` (Menu Handler)**
    *   **职责**: 监听块菜单点击。
    *   **功能**: 提供 4 个操作（构建子文档、构建标题行、从子文档拉取、从标题行拉取）。
    *   **安全机制**: `syncManager` 中包含检查，禁止在自动生成的 Index/Outline 上执行此操作，防止破坏。
*   **`src/event/process-iblock.ts` (Core Processor)**
    *   **职责**: 处理单个列表项的具体同步逻辑。
    *   **逻辑**: 涉及复杂的 Regex 解析，用于在同步内容时保留 Markdown 格式（加粗、颜色等）。

## 4. 事件与辅助 (Events & Utils)

*   **`src/event/protyleevent.ts`**: 处理 `loaded-protyle-static` 事件，触发自动更新 (`updateIndex`)。
*   **`src/event/emojievent.ts`**: 处理 Alt+Click 点击 Emoji 弹出选择器的逻辑。
*   **`src/utils.ts`**: 通用工具（`client` 实例、`escapeHtml`、`sleep`）。
*   **`src/slash.ts`**: 注册斜杠命令（`/index` 等）。

## 5. UI 组件 (Svelte)

位于 `src/components/`，负责设置界面渲染。
*   `setting.svelte` / `tab/*.svelte`: 设置面板结构。
*   `template-index-tab.svelte`: 包含“插入模式 (Insertion Mode)”等核心配置。
*   `dialog/notebook-dialog.svelte`: 插入笔记本目录的配置弹窗。

---

## 📊 总结：主要功能流

1.  **插入目录 (Index)**: `topbar/slash` -> `insert()` -> `createIndex()` (递归) -> `insertData()` (prependBlock/insertBlock).
2.  **插入大纲 (Outline)**: `topbar/slash` -> `insertDocButton()` -> `insertOutline()` (递归, 包含 `> `) -> `insertData()` (绑定属性到 inner list).
3.  **自动更新**: `doc loaded` -> `updateIndex` -> `insertAuto/insertOutlineAuto` -> 读取旧属性 -> 提取保留锚文本 -> 重新生成 -> `insertData` (更新).
4.  **文档构建器**: `click menu` -> `buildDoc` -> `syncManager` (检查安全) -> `ListProcessor` -> `IBlockProcessor`.
