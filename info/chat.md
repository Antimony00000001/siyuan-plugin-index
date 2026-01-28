# 🔄 IndexPlugin 自动更新机制深度解析

通过对整个项目代码的分析，特别是 `src/index.ts`, `src/event/protyleevent.ts` 和 `src/creater/createIndex.ts`，现总结两种自动更新机制的差异及其根本原因。

## 1. 触发机制 (Trigger)

这两种自动更新都是由同一个事件触发的：

*   **事件**: `loaded-protyle-static` (文档被加载/打开时触发)。
*   **入口**: `src/index.ts` 注册了监听器：
    ```typescript
    this.eventBus.on("loaded-protyle-static", updateIndex);
    ```
*   **分发**: `src/event/protyleevent.ts` 中的 `updateIndex` 函数接收事件，并同时调用了两个更新函数：
    ```typescript
    insertAuto(notebookId,path,parentId);      // 更新目录
    insertOutlineAuto(parentId);               // 更新大纲
    ```

这意味着每次你打开或刷新文档时，只要满足条件（如存在对应的 `custom-*-create` 属性且开启了自动更新），两者都会尝试运行。

## 2. 机制对比

### A. 目录 (Index) 自动更新 - ⚠️ “覆盖型”更新

这是导致你自定义 Icon/Separator 被覆盖的机制。

*   **函数**: `insertAuto` -> `createIndex`
*   **文件**: `src/creater/createIndex.ts`
*   **核心逻辑**:
    它在重新生成目录列表项时，**强制**重新获取目标文档当前的 Icon，并将其作为块引用的锚文本。
    ```typescript
    // createIndex 函数中
    let iconStr = getProcessedDocIcon(icon, subFileCount != 0); // 获取当前文档图标
    // ...
    // 直接写入：((ID '当前图标')) 文档标题
    data += `((${id} '${safeIconStr}')) ${name}\n`;
    ```
*   **后果**:
    无论你之前是否手动修改过引用的锚文本（例如改成自定义的 Emoji 或符号），一旦自动更新触发，它都会被文档原本的图标无情覆盖。

### B. 大纲 (Outline) 自动更新 - ✅ “理想型”更新

这是你觉得好用的机制，格式同步且锚文本稳定。

*   **函数**: `insertOutlineAuto` -> `insertOutline`
*   **文件**: `src/creater/createIndex.ts`
*   **核心逻辑**:
    它在生成列表项时，使用了**静态**的锚文本（默认为 `➖`），并且尝试保留目标块的 Markdown 格式。
    ```typescript
    // insertOutline 函数中
    let anchorText = "➖"; // 硬编码的静态符号
    
    // ...
    // 写入：((ID '静态符号')) 标题文本
    data += `((${id} '${anchorText}')) ${name}${ialStr}\n`;
    ```
*   **优势**:
    1.  **锚文本与内容分离**: 链接部分 `((id '➖'))` 仅仅充当跳转按钮，不承载标题内容。
    2.  **稳定性**: 只要代码不改，锚文本永远是 `➖`，不会因为目标文档图标变了或者标题变了而重置锚文本。
    3.  **格式保留**: 它通过 `extractHeadingContent` 和 `filterIAL` 尝试把目标标题的格式（粗体、颜色等）带过来。

## 3. 改进建议

为了让“目录 (Index)”的更新也能达到“大纲”的效果，你需要修改 `createIndex` 函数的逻辑，使其：
1.  **放弃使用文档 Icon 做锚文本**（或者提供选项）。
2.  **采用静态字符**（如 `📄`, `📑` 或自定义字符）作为锚文本。
3.  **分离结构**：改为 `((ID '静态字符')) 标题` 的形式。

这样，自动更新时只会刷新后面的“标题”部分，而不会动前面的“静态字符”锚文本（也就不会覆盖你自定义的分隔符了，如果你把它看作分隔符的话）。

---

# 🚫 排除干扰：Smart List Sync (process-*.ts)

在代码中还存在另一套同步逻辑，位于 `src/event/process-iblock.ts` 和 `src/event/process-list.ts`。

*   **功能**: 提供块菜单中的手动操作（“构建子文档”、“从子文档拉取”等）。
*   **状态**: **与上述自动更新 bug 无关**。
*   **区别**:
    *   `createIndex.ts` (Auto Update): 负责**整棵树**的生成和全量刷新。
    *   `process-iblock.ts` (Smart List): 负责**单个条目**的精细化双向同步。
*   **注意**: 即使是这套手动逻辑 (`process-iblock.ts`)，其 `handlePullFromDoc` 方法在拉取时也会默认更新 Icon。但它具备更高级的“格式保留”算法（Regex 替换），这一点与 `insertOutline` 类似，比 `createIndex` 的暴力覆盖要高级。