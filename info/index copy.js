const siyuan = require("siyuan");
const Plugin = siyuan.Plugin;
const showMessage = siyuan.showMessage;

/**
 * 🔗 Constants
 */
const ATTR_INDEX = "custom-index-id";   // 绑定的子文档 ID
const ATTR_OUTLINE = "custom-outline-id"; // 绑定的底部标题 ID

// ➖ 核心分隔符 (显示字符)
const SEP_CHAR = "➖";
const DEFAULT_ICON = "📄";

class ListBlockPlugin extends Plugin {

  onload() {
    console.log("🧩 ListBlockPlugin: Smart Selector Loaded");
    this.eventBus.on("click-blockicon", this.onBlockIconClick.bind(this));
  }

  async onBlockIconClick({ detail }) {
    const { menu, blockElements } = detail;
    if (!blockElements || blockElements.length === 0) return;

    const blockElement = blockElements[0];
    const blockId = blockElement.getAttribute("data-node-id");
    const blockType = blockElement.getAttribute("data-type");

    if (blockType !== "NodeList" && blockType !== "NodeListItem") return;

    menu.addItem({
      icon: "iconUpload",
      label: "📤 推送 -> 子文档 (纯文本标题)",
      click: () => this.syncManager(blockId, blockType, "PUSH_TO_DOC")
    });

    menu.addItem({
      icon: "iconDownload",
      label: "📥 拉取 <- 子文档 (保留格式)",
      click: () => this.syncManager(blockId, blockType, "PULL_FROM_DOC")
    });

    menu.addSeparator();

    menu.addItem({
      icon: "iconRef",
      label: "👇 推送 -> 底部标题 (分隔符链接)",
      click: () => this.syncManager(blockId, blockType, "PUSH_TO_BOTTOM")
    });

    menu.addItem({
      icon: "iconRefresh",
      label: "👆 拉取 <- 底部标题 (更新内容)",
      click: () => this.syncManager(blockId, blockType, "PULL_FROM_BOTTOM")
    });

    menu.addSeparator();

    menu.addItem({
      icon: "iconBug",
      label: "🐞 Debug Info (Console)",
      click: () => new ItemProcessor(this).debugBlockInfo(blockId, blockType)
    });
  }

  async syncManager(sourceBlockId, sourceType, actionType) {
    try {
      const processor = new ItemProcessor(this);
      await processor.processRecursive(sourceBlockId, sourceType, actionType);
      
      if (processor.errors.length > 0) {
          showMessage(`⚠️ 部分条目因格式复杂未更新文本 (x${processor.errors.length})，仅更新了图标`, -1, "info");
      } else {
          showMessage("✅ 同步完成");
      }
    } catch (e) {
      console.error(e);
      showMessage(`同步失败: ${e.message}`, -1, "error");
    }
  }

  // ==================== API Wrappers ====================
  async sql(stmt) { return (await this.post("/api/query/sql", { stmt })); }
  async getBlockAttrs(id) { return await this.post("/api/attr/getBlockAttrs", { id }); }
  async setBlockAttrs(id, attrs) { return await this.post("/api/attr/setBlockAttrs", { id, attrs: attrs }); }
  async updateBlockText(id, text) { return await this.post("/api/block/updateBlock", { id, dataType: "markdown", data: text }); }
  async createDocWithMd(notebook, path, markdown) { return await this.post("/api/filetree/createDocWithMd", { notebook, path, markdown }); }
  async renameDocByID(id, title) { return await this.post("/api/filetree/renameDocByID", { id, title }); }
  async getHPathByID(id) { return await this.post("/api/filetree/getHPathByID", { id }); }
  async getPathByID(id) { return await this.post("/api/filetree/getPathByID", { id }); }
  async getRootId(id) { const r = await this.sql(`SELECT root_id FROM blocks WHERE id = '${id}' LIMIT 1`); return r[0]?.root_id; }
  async checkBlockExists(id) { const r = await this.sql(`SELECT id FROM blocks WHERE id = '${id}' LIMIT 1`); return !!r[0]; }
  async appendBlock(parentID, data) { return await this.post("/api/block/appendBlock", { parentID, dataType: "markdown", data }); }
  async insertBlockAfter(previousID, data) { return await this.post("/api/block/insertBlock", { previousID, dataType: "markdown", data }); }
  async post(url, data) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const res = await r.json();
    if (res.code !== 0) throw new Error(res.msg);
    return res.data;
  }
}

// ============================================================ 
// Processor Class
// ============================================================ 

class ItemProcessor {
  constructor(plugin) {
    this.plugin = plugin;
    this.errors = [];
  }

  async processRecursive(blockId, type, actionType, ctx = null) {
    if (!ctx) {
        ctx = { previousId: null, parentId: null, level: 1 };
    }
    
    // 🧠 核心逻辑：如果是推送创建文档，需要反向遍历，才能保证创建出来的文档顺序是正的
    const shouldReverse = actionType === "PUSH_TO_DOC";

    if (type === "NodeListItem" || type === "i") {
        const resultId = await this.processSingleItem(blockId, actionType, ctx);
        if (resultId) ctx.previousId = resultId;

        const childCtx = {
            previousId: ctx.previousId,
            parentId: (actionType === "PUSH_TO_DOC" || actionType === "PULL_FROM_DOC") ? resultId : ctx.parentId,
            level: ctx.level + 1
        };

        let children = await this.plugin.sql(
            `SELECT id, type, subtype FROM blocks WHERE parent_id = '${blockId}' AND type = 'l' ORDER BY sort ASC`
        );
        // 如果需要反序创建
        if (shouldReverse) children = children.reverse();

        for (const child of children) {
            await this.processRecursive(child.id, "NodeList", actionType, childCtx);
            ctx.previousId = childCtx.previousId;
        }
        return resultId;

    } else if (type === "NodeList" || type === "l") { 
        let children = await this.plugin.sql(
            `SELECT id, type FROM blocks WHERE parent_id = '${blockId}' AND type = 'i' ORDER BY sort ASC`
        );
        // 如果需要反序创建
        if (shouldReverse) children = children.reverse();
        
        for (const child of children) {
            await this.processRecursive(child.id, "NodeListItem", actionType, ctx);
        }
    }
  }

  async processSingleItem(listItemId, actionType, ctx) {
    const core = await this.getCoreContentInfo(listItemId);
    if (!core) return ctx.previousId;

    const containerAttrs = await this.plugin.getBlockAttrs(core.containerId);
    let resultId = ctx.previousId;

    switch (actionType) {
      case "PUSH_TO_DOC":
        resultId = await this.handlePushToDoc(core, containerAttrs, ctx);
        break;
      case "PULL_FROM_DOC":
        await this.handlePullFromDoc(core, containerAttrs);
        if (containerAttrs[ATTR_INDEX]) resultId = containerAttrs[ATTR_INDEX];
        break;
      case "PUSH_TO_BOTTOM":
        resultId = await this.handlePushToBottom(core, containerAttrs, ctx);
        break;
      case "PULL_FROM_BOTTOM":
        await this.handlePullFromBottom(core, containerAttrs);
        if (containerAttrs[ATTR_OUTLINE]) resultId = containerAttrs[ATTR_OUTLINE];
        break;
    }
    return resultId || ctx.previousId;
  }

  // ============================================================ 
  // ✨ PUSH: 列表项 -> 底部标题
  // ============================================================ 
  async handlePushToBottom(core, containerAttrs, ctx) {
    let cleanText = core.syncText;
    cleanText = cleanText.replace(/^[📄➖\s]+/, ""); 
    cleanText = cleanText.replace(/^\[.*?\]\(.*?\)/, "").trim(); 

    if (!cleanText) cleanText = "Untitled";

    const prefix = "#".repeat(Math.min(ctx.level, 6));
    const titleContent = `${prefix} ${cleanText}`; 
    
    const stylesToKeep = this.filterSystemAttrs(await this.plugin.getBlockAttrs(core.contentId));
    let targetId = containerAttrs[ATTR_OUTLINE];
    const previousTargetId = ctx.previousId;

    if (!targetId || !(await this.plugin.checkBlockExists(targetId))) {
      let r;
      if (previousTargetId) {
        r = await this.plugin.insertBlockAfter(previousTargetId, titleContent);
      } else {
        const rootId = await this.plugin.getRootId(core.containerId);
        r = await this.plugin.appendBlock(rootId, titleContent);
      }
      
      targetId = r?.[0]?.doOperations?.[0]?.id;
      if (targetId) {
        await this.plugin.setBlockAttrs(core.containerId, { [ATTR_OUTLINE]: targetId });
        if (Object.keys(stylesToKeep).length > 0) await this.plugin.setBlockAttrs(targetId, stylesToKeep);
      }
    } else {
      await this.plugin.updateBlockText(targetId, titleContent);
      if (Object.keys(stylesToKeep).length > 0) await this.plugin.setBlockAttrs(targetId, stylesToKeep);
    }

    const finalMd = await this.constructListItemMarkdown(core.containerId, targetId, core.syncMd);
    await this.plugin.updateBlockText(core.contentId, finalMd);
    if (Object.keys(stylesToKeep).length > 0) await this.plugin.setBlockAttrs(core.contentId, stylesToKeep);

    return targetId;
  }

  // ============================================================ 
  // ✨ PUSH: 列表项 -> 子文档
  // ============================================================ 
  async handlePushToDoc(core, containerAttrs, ctx) {
    const title = core.syncText;
    if (!title) return null;

    const stylesToKeep = this.filterSystemAttrs(await this.plugin.getBlockAttrs(core.contentId));
    let docId = containerAttrs[ATTR_INDEX];
    
    if (docId) {
        const exists = await this.plugin.checkBlockExists(docId);
        if (!exists) docId = null;
    }

    if (docId) {
      await this.plugin.renameDocByID(docId, title);
      const newMd = await this.constructListItemMarkdown(core.containerId, containerAttrs[ATTR_OUTLINE], core.syncMd);
      await this.plugin.updateBlockText(core.contentId, newMd);
      if(Object.keys(stylesToKeep).length > 0) await this.plugin.setBlockAttrs(core.contentId, stylesToKeep);
      return docId;
    }

    let notebook, path;
    if (ctx.parentId) {
        const parentPathInfo = await this.plugin.getPathByID(ctx.parentId);
        const parentHPath = await this.plugin.getHPathByID(ctx.parentId);
        if (parentPathInfo && parentHPath) {
            notebook = parentPathInfo.notebook;
            path = `${parentHPath}/${title}`;
        }
    } 
    if (!notebook || !path) {
        const hPath = await this.plugin.getHPathByID(core.containerId);
        const pathInfo = await this.plugin.getPathByID(core.containerId);
        notebook = pathInfo.notebook;
        path = `${hPath}/${title}`;
    }

    const newId = await this.plugin.createDocWithMd(notebook, path, "");
    if (newId) {
      await this.plugin.setBlockAttrs(core.containerId, { [ATTR_INDEX]: newId });
      const newMd = await this.constructListItemMarkdown(core.containerId, containerAttrs[ATTR_OUTLINE], core.syncMd);
      await this.plugin.updateBlockText(core.contentId, newMd);
      if(Object.keys(stylesToKeep).length > 0) await this.plugin.setBlockAttrs(core.contentId, stylesToKeep);
      return newId;
    }
    return null;
  }

  // ============================================================ 
  // ✨ PULL: 子文档 -> 列表项 (✅ 连续性检查 + 属性卫士)
  // ============================================================ 
  async handlePullFromDoc(core, containerAttrs) {
    if (!containerAttrs[ATTR_INDEX]) return;
    const docId = containerAttrs[ATTR_INDEX];
    const docAttrs = await this.plugin.getBlockAttrs(docId);
    
    if (!docAttrs.title) return;
    const newTitle = docAttrs.title;
    
    const newIconChar = this.resolveIcon(docAttrs.icon || DEFAULT_ICON);
    const newIconLink = `[${newIconChar}](siyuan://blocks/${docId})`;

    // 🛡️ 1. 获取并保护当前属性 (颜色/背景等)
    const currentAttrs = await this.plugin.getBlockAttrs(core.contentId);
    const stylesToPreserve = this.filterSystemAttrs(currentAttrs);

    // 2. 准备 Markdown Body (剥离 IAL)
    const ialRegex = /(?:^|\s)(\{:[^}]+\})\s*$/;
    const match = core.markdown.match(ialRegex);
    const originalIal = match ? match[1] : ""; 
    let bodyMd = core.markdown.replace(ialRegex, "").trimEnd();
    
    let isSuccess = false;

    if (core.hasSeparator) {
        // --- 步骤 A: 总是尝试更新 Icon ---
        const iconRegex = /^\s*\[.*?\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)/;
        if (iconRegex.test(bodyMd)) {
            bodyMd = bodyMd.replace(iconRegex, newIconLink);
        } else {
            bodyMd = newIconLink + " " + bodyMd.trimStart();
        }

        // --- 步骤 B: 提取旧内容 Markdown ---
        // 我们要得到除了Icon和Separator之外的“内容部分(Content MD)”
        let contentMd = bodyMd;
        const extractIconRegex = /^\s*\[.*?\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)\s*/;
        contentMd = contentMd.replace(extractIconRegex, "");
        const extractSepRegex = /^\s*(\[➖\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)|➖)\s*/;
        contentMd = contentMd.replace(extractSepRegex, "");
        contentMd = contentMd.trim();

        // --- 步骤 C: 计算“纯文本” ---
        const calculatedPureText = this.stripMarkdownSyntax(contentMd);

        // --- 步骤 D: 核心判断 —— 连续性检查 (Continuity Check) ---
        if (calculatedPureText && contentMd.includes(calculatedPureText)) {
             if (calculatedPureText !== newTitle) {
                // 只替换第一次出现的文本，保留外围格式
                bodyMd = bodyMd.replace(calculatedPureText, newTitle);
             }
             isSuccess = true;
        } else {
             // ⚠️ 纯文本不连续，说明内部有复杂格式
             // 跳过文本更新，但 bodyMd 里的 Icon 已经更新了
             isSuccess = false;
             
             // 如果内容确实不一样，才报错提示
             if (calculatedPureText !== newTitle) {
                 this.errors.push(core.containerId);
             }
        }
    }

    let finalMd = "";

    // 构建最终 Markdown
    if (core.hasSeparator) {
        // 无论是更新了文本，还是跳过了文本，bodyMd 里都已经更新了 Icon
        // 拼接回 IAL
        finalMd = bodyMd + (originalIal ? " " + originalIal : "");
    } else {
        // 无分隔符分支 (Fallback -> 完全重构)
        let reconstructed = await this.constructListItemMarkdown(
            core.containerId, 
            containerAttrs[ATTR_OUTLINE], 
            newTitle
        );
        finalMd = reconstructed + (originalIal ? " " + originalIal : "");
    }

    await this.plugin.updateBlockText(core.contentId, finalMd);

    // 🛡️ 3. 强制恢复属性 (双重保险)
    if (Object.keys(stylesToPreserve).length > 0) {
        await this.plugin.setBlockAttrs(core.contentId, stylesToPreserve);
    }
  }

  // ============================================================ 
  // ✨ PULL: 底部标题 -> 列表项
  // ============================================================ 
  async handlePullFromBottom(core, containerAttrs) {
    if (!containerAttrs[ATTR_OUTLINE]) return;
    const outlineId = containerAttrs[ATTR_OUTLINE];
    const rows = await this.plugin.sql(`SELECT markdown FROM blocks WHERE id = '${outlineId}' LIMIT 1`);
    if (!rows[0]) return;

    const newContentMd = this.cleanHeaderContent(rows[0].markdown);
    
    const sourceAttrs = await this.plugin.getBlockAttrs(outlineId);
    const validStyles = this.filterSystemAttrs(sourceAttrs);

    const ialRegex = /(?:^|\s)(\{:[^}]+\})\s*$/;
    const match = core.markdown.match(ialRegex);
    const originalIal = match ? match[1] : ""; 
    let bodyMd = core.markdown.replace(ialRegex, "").trimEnd();

    let isHandled = false;

    if (core.hasSeparator) {
        let tempForExtract = bodyMd;
        const extractIconRegex = /^\s*\[.*?\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)\s*/;
        tempForExtract = tempForExtract.replace(extractIconRegex, "");
        const extractSepRegex = /^\s*(\[➖\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)|➖)\s*/;
        tempForExtract = tempForExtract.replace(extractSepRegex, "");
        
        let oldPureText = tempForExtract.trim(); 

        if (oldPureText && bodyMd.includes(oldPureText)) {
            if (oldPureText !== newContentMd) { 
                bodyMd = bodyMd.replace(oldPureText, newContentMd);
                const finalMd = bodyMd + (originalIal ? " " + originalIal : "");
                await this.plugin.updateBlockText(core.contentId, finalMd);
            }
            
            if (Object.keys(validStyles).length > 0) {
                 await this.plugin.setBlockAttrs(core.contentId, validStyles);
            }
            isHandled = true;
        }
    }

    if (isHandled) return;

    // Fallback
    let baseMd = await this.constructListItemMarkdown(
        core.containerId, 
        outlineId, 
        newContentMd
    );

    const finalMd = baseMd + (originalIal ? " " + originalIal : "");
    await this.plugin.updateBlockText(core.contentId, finalMd);
    
    if (Object.keys(validStyles).length > 0) {
        await this.plugin.setBlockAttrs(core.contentId, validStyles);
    }
  }

  // ============================================================ 
  // 🛠️ Helpers
  // ============================================================ 

  // 辅助函数：剥离 Markdown 符号获取纯文本
  stripMarkdownSyntax(md) {
      if (!md) return "";
      let plain = md;
      plain = plain.replace(/(\*\*|__|~~|==)/g, ""); 
      plain = plain.replace(/(\*|_)/g, "");
      plain = plain.replace(/<[^>]+>/g, "");
      plain = plain.replace(/\[([^\]]*)\]\([^\)]+\)/g, "$1");
      plain = plain.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "$1");
      plain = plain.replace(/`([^`]+)`/g, "$1");
      plain = plain.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      return plain.trim();
  }

  async constructListItemMarkdown(containerId, headingId, syncText) {
    const parts = [];
    const containerAttrs = await this.plugin.getBlockAttrs(containerId);
    const docId = containerAttrs[ATTR_INDEX];
    
    if (docId) {
        let icon = DEFAULT_ICON;
        try {
             const docInfo = await this.plugin.getBlockAttrs(docId);
             icon = this.resolveIcon(docInfo.icon || DEFAULT_ICON); 
        } catch(e) {}
        parts.push(`[${icon}](siyuan://blocks/${docId})`);
    }

    if (headingId) {
        parts.push(`[${SEP_CHAR}](siyuan://blocks/${headingId})`);
    } else {
        parts.push(SEP_CHAR);
    }
    parts.push(syncText.trim());
    return parts.join(" ");
  }

  resolveIcon(iconStr) {
    if (!iconStr) return DEFAULT_ICON;
    if (iconStr.includes(".") || iconStr.includes("/")) return DEFAULT_ICON;
    const hexRegex = /^[0-9a-fA-F]+(-[0-9a-fA-F]+)*$/;
    if (hexRegex.test(iconStr)) {
        try { return String.fromCodePoint(...iconStr.split('-').map(s => parseInt(s, 16))); } 
        catch (e) { return iconStr; }
    }
    return iconStr;
  }

  // ============================================================ 
  // 🧠 Core Info
  // ============================================================ 
  async getCoreContentInfo(listItemId) {
    const self = await this.plugin.sql(`SELECT type FROM blocks WHERE id = '${listItemId}' LIMIT 1`);
    if (!self[0] || self[0].type !== "i") return null;

    const children = await this.plugin.sql(
        `SELECT id, type, markdown, content FROM blocks WHERE parent_id = '${listItemId}' AND type = 'p' ORDER BY sort ASC`
    );
    if (!children || children.length === 0) return null;

    const sepRegex = /(\[➖\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)|➖)/;
    const iconRegex = /\s*\[.*?\]\(siyuan:\/\/blocks\/.*?\)\s*/; 

    let targetBlock = children.find(child => {
        const md = child.markdown || "";
        return sepRegex.test(md) || iconRegex.test(md);
    });
    if (!targetBlock) targetBlock = children[0];

    const contentId = targetBlock.id;
    const md = targetBlock.markdown || "";
    const content = targetBlock.content || "";
    
    let tempMd = md.replace(/\s*\{:[^}]+\}\s*$/, "");
    let hasSeparator = false;

    const docLinkRegex = /^\s*\[.*?\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)\s*/;
    if (docLinkRegex.test(tempMd)) {
        tempMd = tempMd.replace(docLinkRegex, "");
    }

    const sepLinkRegex = /^\s*(\[➖\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)|➖)\s*/;
    if (sepLinkRegex.test(tempMd)) {
        hasSeparator = true;
        tempMd = tempMd.replace(sepLinkRegex, "");
    }

    let syncMd = tempMd.trim();
    let plain = syncMd;
    plain = plain.replace(/(\*\*|__|\*|_|~~)/g, ""); 
    plain = plain.replace(/\[([^\]]*)\]\([^\)]+\)/g, "$1");
    plain = plain.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "$1");
    plain = plain.replace(/`([^`]+)`/g, "$1");
    plain = plain.replace(/<[^>]+>/g, "");
    plain = plain.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

    return {
        containerId: listItemId,
        contentId: contentId,
        hasSeparator,
        syncText: plain.trim(),
        syncMd,
        markdown: md, 
        content: content
    };
  }

  cleanHeaderContent(md) {
    if (!md) return "";
    let content = md.replace(/^#+\s+/, "").trim();
    content = content.replace(/\s*\{:[^}]+\}\s*$/, "");
    return content.trim();
  }

  filterSystemAttrs(attrs) {
    const validAttrs = {};
    const ignoreList = ["id", "updated", "created", "hash", "box", "path", "hpath", "parent_id", "root_id", "type", "subtype", "sort", "markdown", "content", "name", "alias", "memo", ATTR_INDEX, ATTR_OUTLINE];
    for (const [key, val] of Object.entries(attrs)) {
      if (!ignoreList.includes(key)) validAttrs[key] = val;
    }
    return validAttrs;
  }
  
  async debugBlockInfo(blockId, type) {
    console.log(`🐞 Debug Block: ${blockId}`);
  }
}

module.exports = ListBlockPlugin;