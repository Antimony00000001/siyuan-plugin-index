/**
 * 🛠️ SiYuan Console Script: Sync Heading -> List Item (Preserving Format & Attributes)
 * 
 * 这是一个可以在思源笔记控制台直接运行的脚本，用于模拟插件的核心同步逻辑。
 * 它演示了如何将一个标题块（Heading）的内容和样式，同步到一个列表项（List Item）中，
 * 同时保留列表项原有的“引用”或“链接”结构，并正确处理样式（通过 Span 包裹）。
 * 
 * 使用方法：
 * 1. 在思源笔记按 F12 打开控制台 (Console)
 * 2. 粘贴本代码并回车
 * 3. 输入命令调用: syncHeadingToList("标题块ID", "列表项块ID")
 */

async function syncHeadingToList(headingId, listItemId) {
    console.clear();
    console.group("🚀 开始同步: 标题 -> 列表");
    console.log(`Source (Heading): ${headingId}`);
    console.log(`Target (List):    ${listItemId}`);

    const BRACKET = "🔸"; // 插件使用的边界符

    // ==========================================
    // 1. 获取标题块 (Heading) 的信息
    // ==========================================
    // 获取属性（为了提取样式 color, background-color 等）
    const headingAttrsRes = await request("/api/attr/getBlockAttrs", { id: headingId });
    // 获取 Markdown（为了提取富文本内容）
    const headingSqlRes = await request("/api/query/sql", { 
        stmt: `SELECT markdown, content FROM blocks WHERE id = '${headingId}' LIMIT 1` 
    });
    
    if (!headingSqlRes.data[0]) {
        console.error("❌ 找不到标题块");
        console.groupEnd();
        return;
    }

    const headingMarkdown = headingSqlRes.data[0].markdown;
    const headingAttrs = headingAttrsRes.data;
    
    // 1.1 解析标题内容：移除开头的 # 号和结尾的 IAL 属性
    // 例如: "## **Bold** text {: id='xxx' style='color:red'}" -> "**Bold** text"
    let sourceContent = headingMarkdown.replace(/^#+\s+/, "").trim();
    const ialMatch = sourceContent.match(/(\s*\{:[^}]+\}\s*)$/);
    if (ialMatch) {
        sourceContent = sourceContent.slice(0, ialMatch.index).trim();
    }

    // 1.2 生成样式属性字符串 (用于 span)
    // 过滤掉系统属性，只保留样式相关的自定义属性
    const ignoreAttrs = new Set(["id", "updated", "created", "hash", "box", "path", "hpath", "parent_id", "root_id", "type", "subtype", "sort", "custom-index-id", "custom-outline-id"]);
    const styleParts = [];
    for (const [k, v] of Object.entries(headingAttrs)) {
        if (!ignoreAttrs.has(k)) styleParts.push(`${k}="${v}"`);
    }
    const styleString = styleParts.join(" ");

    console.log("📄 标题纯净内容:", sourceContent);
    console.log("🎨 标题样式属性:", styleString || "(无)");

    // ==========================================
    // 2. 获取列表项 (List Item) 的信息
    // ==========================================
    const listSqlRes = await request("/api/query/sql", { 
        stmt: `SELECT markdown FROM blocks WHERE id = '${listItemId}' LIMIT 1` 
    });

    if (!listSqlRes.data[0]) {
        console.error("❌ 找不到列表项块");
        console.groupEnd();
        return;
    }

    const listMarkdown = listSqlRes.data[0].markdown;
    
    // 2.1 提取列表项中的“核心富文本”部分（去除 * 标记和 🔸 边界符）
    // 假设列表项格式为: * 🔸((id '内容'))🔸
    const innerMatch = listMarkdown.match(new RegExp(`${BRACKET}(.*?)${BRACKET}`));
    const oldRichText = innerMatch ? innerMatch[1] : listMarkdown.replace(/^(\s*([-*+]|\d+\.|#+)\s+)/, "").trim();

    console.log("📝 列表项原内容:", oldRichText);

    // ==========================================
    // 3. 构建新内容 (保留列表项的引用/链接结构)
    // ==========================================
    
    // 3.1 核心内容处理：如果有样式，用 <span> 包裹内容
    // 关键点：样式只包裹文字，不包裹外层的 ((...))
    let newInnerContent = sourceContent;
    if (styleString) {
        newInnerContent = `<span ${styleString}>${sourceContent}</span>`;
    }

    // 3.2 结构保留：检查列表项原来是否是 引用 或 链接
    // 我们需要把 newInnerContent 塞进原来的结构里
    let finalContent = newInnerContent;

    // 清理新内容中的冲突语法 (防止嵌套错误)
    const cleanNew = newInnerContent
        .replace(/\(\([0-9a-z-]+\s+['"](.*?)['"]\)\)/g, "$1") // 移除内嵌块引用
        .replace(/\\\[(.*?)\\\]\(.*?\)/g, "$1"); // 移除内嵌链接

    // Case A: 原来是链接 [text](url)
    const linkMatch = oldRichText.match(/^\\[([\s\S]*?)\\]\(([\s\S]*?)\)$/);
    if (linkMatch) {
        // 转义方括号
        const safeText = cleanNew.replace(/\\\[/g, "\\[").replace(/\\]/g, "\\]");
        finalContent = `[${safeText}](${linkMatch[2]})`;
        console.log("🔗 检测到链接结构，已保留");
    } 
    // Case B: 原来是块引用 ((id "text"))
    else {
        const refMatch = oldRichText.match(/^\(\(([0-9a-z-]+)\s+(['"])([\s\S]*?)\2\)\)$/);
        if (refMatch) {
            const id = refMatch[1];
            const quote = refMatch[2]; // ' or "
            // 转义引号
            let safeText = cleanNew;
            if (quote === "'") safeText = safeText.replace(/'/g, "&apos;");
            if (quote === '"') safeText = safeText.replace(/"/g, "&quot;");
            finalContent = `((${id} ${quote}${safeText}${quote}))`;
            console.log("🔗 检测到引用结构，已保留");
        } else {
            console.log("ℹ️ 未检测到包装结构，使用纯文本");
        }
    }

    // ==========================================
    // 4. 更新列表项
    // ==========================================
    // 组装最终 Markdown: * 🔸NewContent🔸
    
    // 获取列表标记 (如 * 或 1.)
    const listMarkerMatch = listMarkdown.match(/^(\s*([-*+]|\d+\.)\s+)/);
    const listMarker = listMarkerMatch ? listMarkerMatch[1] : "* ";

    const finalMarkdown = `${listMarker}${BRACKET}${finalContent}${BRACKET}`;

    console.log("✅ 最终生成的 Markdown:", finalMarkdown);

    await request("/api/block/updateBlock", {
        id: listItemId,
        dataType: "markdown",
        data: finalMarkdown
    });

    console.log("✨ 同步成功!");
    console.groupEnd();
}

/**
 * 通用请求函数
 */
async function request(url, data) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    return await res.json();
}