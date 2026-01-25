# 🔄 底部标题 -> 列表项同步：格式零丢失机制揭秘

在 `ListBlockPlugin` 中，从底部标题（Heading）拉取内容回列表项（List Item）时，为了确保**颜色、背景**以及**加粗、下划线、删除线等行内格式**完全不丢失，采用了以下多重保护策略：

## 1. 🛡️ 属性（样式）级保护

同步不仅仅是同步文本，还包括块属性（Block Attributes，即颜色、背景色等）。

*   **提取源属性**：代码首先获取底部标题的所有属性 (`sourceAttrs`)。
*   **过滤系统属性**：使用 `filterSystemAttrs` 剔除系统自动生成的属性（如 ID, updated, sort 等），只保留用户定义的样式属性（如 `style`, `custom-*`）。
*   **强制应用**：在更新文本后，会显式调用 `setBlockAttrs` 将这些保留下来的样式属性重新应用到列表项上。这确保了如果标题变色了，列表项也会跟着变色。

### 核心代码片段

```javascript
// 获取源标题属性
const sourceAttrs = await this.plugin.getBlockAttrs(outlineId);
// 过滤掉系统属性，只保留样式
const validStyles = this.filterSystemAttrs(sourceAttrs);

// ... (文本更新逻辑) ...

// 最后强制应用样式
if (Object.keys(validStyles).length > 0) {
     await this.plugin.setBlockAttrs(core.contentId, validStyles);
}
```

## 2. 🧬 文本级保护（智能替换算法）

这是保留行内格式（Inline Formatting，如 `**bold**`, `<u>underline</u>`）的核心机制。

代码**不会**简单粗暴地用标题的纯文本覆盖整个列表项，而是采用了一种“**外科手术式**”的替换策略：

1.  **解构当前内容**：
    *   先把列表项的 Markdown 拆解，分离出 **Icon 链接**、**分隔符链接** 和 **剩余的内容文本**。
    *   把剩余内容文本中的 Markdown 符号剥离（stripMarkdownSyntax），计算出旧的“纯文本”。

2.  **连续性检查 (Continuity Check)**：
    *   代码会检查旧的“纯文本”是否还存在于当前的 Markdown 源码中。
    *   **关键点**：如果存在，代码执行 `bodyMd.replace(oldPureText, newContentMd)`。
    *   **效果**：这意味着只替换了文字部分，而包裹在文字外面的 Markdown 符号（例如 `**...**` 或 `<u>...</u>`）会被原封不动地保留下来。

    > **例子**：
    > *   列表项原貌：`[📄] [➖] **<u>旧标题</u>**`
    > *   底部标题新内容：`新标题`
    > *   **操作**：识别出旧纯文本为 `旧标题`，在原 Markdown 中将其替换为 `新标题`。
    > *   **结果**：`[📄] [➖] **<u>新标题</u>**` （加粗和下划线完美保留）

### 核心代码片段

```javascript
// A. 剥离 Icon 和 分隔符，获取旧的纯文本
let tempForExtract = bodyMd;
tempForExtract = tempForExtract.replace(extractIconRegex, "").replace(extractSepRegex, "");
let oldPureText = tempForExtract.trim(); 

// B. 连续性检查：确认旧文本是否还在 bodyMd 中（未被破坏）
if (oldPureText && bodyMd.includes(oldPureText)) {
    if (oldPureText !== newContentMd) { 
        // C. 手术式替换：只替换文字，保留周围的 Markdown 符号 (**...**)
        bodyMd = bodyMd.replace(oldPureText, newContentMd);
        
        const finalMd = bodyMd + (originalIal ? " " + originalIal : "");
        await this.plugin.updateBlockText(core.contentId, finalMd);
    }
    isHandled = true; // 标记处理成功，跳过兜底逻辑
}
```

## 3. ⛑️ 兜底机制 (Fallback)

如果列表项的结构过于复杂，或者被用户修改得面目全非，导致无法精准定位“旧文本”（即连续性检查失败）：

*   代码会回退到 `constructListItemMarkdown` 方法。
*   这虽然会重构标准格式（`Icon + Separator + 新文本`），可能会丢失部分复杂的行内嵌套格式，但它依然会：
    *   保留 Icon 和 分隔符链接。
    *   重新应用第一步中提取的块属性（颜色/背景）。
    *   保留原本的 IAL。

```javascript
if (!isHandled) {
    // 重新构建标准 Markdown 结构
    let baseMd = await this.constructListItemMarkdown(
        core.containerId, 
        outlineId, 
        newContentMd
    );
    // ...
}
```

通过这种 **“属性同步 + 智能文本替换 + 兜底重构”** 的三层架构，插件实现了在同步内容的同时，最大程度地“冻结”和保护用户的格式信息。