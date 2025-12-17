const siyuan = require("siyuan");

const Plugin = siyuan.Plugin;
const showMessage = siyuan.showMessage;

/**
 * 🔗 Constants
 */
const ATTR_CHILD_DOC = "custom-sync-child-doc";
const ATTR_LOCAL_BLOCK = "custom-sync-local-block";
const ATTR_PARENT_BLOCK = "custom-sync-parent-block";

// 🔸 核心边界符 (仅用于列表项 List Item)
const BRACKET = "🔸"; 

class ListBlockPlugin extends Plugin {

    onload() {
        console.log("🧩 ListBlockPlugin: Rich-Sync Loaded");
        this.eventBus.on("click-blockicon", this.onBlockIconClick.bind(this));
    }

    async onBlockIconClick({ detail }) {
        const { menu, blockElements } = detail;
        if (!blockElements || blockElements.length === 0) return;

        const blockElement = blockElements[0];
        const blockId = blockElement.getAttribute("data-node-id");

        menu.addItem({
            icon: "iconUpload",
            label: "📤 推送 -> 子文档 (纯文本标题)",
            click: () => this.syncManager(blockId, "PUSH_TO_DOC")
        });
        menu.addItem({
            icon: "iconDownload",
            label: "📥 拉取 <- 子文档 (保留格式)",
            click: () => this.syncManager(blockId, "PULL_FROM_DOC")
        });
        menu.addSeparator();
        menu.addItem({
            icon: "iconRef",
            label: "👇 推送 -> 底部标题 (全量富文本)",
            click: () => this.syncManager(blockId, "PUSH_TO_BOTTOM")
        });
        menu.addItem({
            icon: "iconRefresh",
            label: "👆 拉取 <- 底部标题 (全量富文本)",
            click: () => this.syncManager(blockId, "PULL_FROM_BOTTOM")
        });
    }

    async syncManager(sourceBlockId, actionType) {
        try {
            // 1. 获取核心数据
            const coreInfo = await this.getCoreContentInfo(sourceBlockId);
            if (!coreInfo) {
                showMessage("无法获取块数据", -1, "error");
                return;
            }

            // [Auto-Fix] 仅在推送时，如果当前块没有包裹 🔸，自动包裹
            if (actionType.startsWith("PUSH") && !coreInfo.hasWrapper) {
                const newSelfContent = this.wrapContent(coreInfo.listMarker, coreInfo.richText);
                await this.updateBlockText(coreInfo.targetId, newSelfContent);
                // 更新内存状态，确保后续逻辑使用的是包裹后的逻辑
                coreInfo.hasWrapper = true;
            }

            const attrs = await this.getBlockAttrs(sourceBlockId);

            switch (actionType) {
                case "PUSH_TO_DOC":
                    await this.handlePushToDoc(sourceBlockId, coreInfo, attrs);
                    break;
                case "PULL_FROM_DOC":
                    await this.handlePullFromDoc(sourceBlockId, coreInfo, attrs);
                    break;
                case "PUSH_TO_BOTTOM":
                    await this.handlePushToBottom(sourceBlockId, coreInfo, attrs);
                    break;
                case "PULL_FROM_BOTTOM":
                    await this.handlePullFromBottom(sourceBlockId, coreInfo, attrs);
                    break;
            }
        } catch (e) {
            console.error(e);
            showMessage(`同步中止: ${e.message}`, -1, "error");
        }
    }

    // ============================================================
    // 🏗️ 核心逻辑
    // ============================================================

    wrapContent(marker, content) {
        // 强制包裹：标记 + 🔸 + 内容 + 🔸
        return `${marker}${BRACKET}${content.trim()}${BRACKET}`;
    }

    /**
     * 🛡️ 安全替换逻辑 (仅用于子文档同步)
     * 用于在保留原 Markdown 格式的前提下，仅替换纯文本部分
     */
    safeReplace(fullMarkdown, innerMarkdown, oldPlainText, newPlainText) {
        const oldText = oldPlainText.trim();
        const newText = newPlainText.trim();
        
        if (innerMarkdown.includes(oldText)) {
            const newInner = innerMarkdown.replace(oldText, newText);
            const newFullMarkdown = fullMarkdown.replace(
                `${BRACKET}${innerMarkdown}${BRACKET}`, 
                `${BRACKET}${newInner}${BRACKET}`
            );
            return newFullMarkdown;
        } else {
            return null; // 格式太复杂，无法安全替换
        }
    }

    // --- 场景 1: 子文档同步 (纯文本 <-> 格式化块) ---
    // 逻辑：子文档标题不支持 Markdown，所以必须转纯文本

    async handlePushToDoc(blockId, coreInfo, attrs) {
        const docTitle = coreInfo.plainText; 
        if (!docTitle) throw new Error("纯文本内容为空");

        const childDocId = attrs[ATTR_CHILD_DOC];

        if (childDocId) {
            await this.renameDocByID(childDocId, docTitle);
            showMessage(`子文档重命名为: ${docTitle}`);
        } else {
            const hPath = await this.getHPathByID(blockId);
            const docPathInfo = await this.getPathByID(blockId);
            const newDocPath = `${hPath}/${docTitle}`;
            const newDocId = await this.createDocWithMd(docPathInfo.notebook, newDocPath, "");

            if (newDocId) {
                await this.setBlockAttr(blockId, ATTR_CHILD_DOC, newDocId);
                await this.setBlockAttr(newDocId, ATTR_PARENT_BLOCK, blockId);
                showMessage("✅ 已创建子文档");
            }
        }
    }

    async handlePullFromDoc(blockId, coreInfo, attrs) {
        const childDocId = attrs[ATTR_CHILD_DOC];
        if (!childDocId) { showMessage("未绑定子文档"); return; }

        const childAttrs = await this.getBlockAttrs(childDocId);
        const childTitle = childAttrs.title; // 纯文本

        if (childTitle && childTitle !== coreInfo.plainText) {
            // 需要重新获取 Markdown 来做安全替换
            const currentRows = await this.sql(`SELECT markdown FROM blocks WHERE id = '${coreInfo.targetId}' LIMIT 1`);
            const fullMarkdown = currentRows[0].markdown;
            const match = fullMarkdown.match(new RegExp(`${BRACKET}(.*?)${BRACKET}`));
            
            if (!match) {
                showMessage("无法定位边界符，请先推送", -1, "error");
                return;
            }
            const innerMarkdown = match[1];

            // 尝试保留格式替换
            const newMarkdown = this.safeReplace(fullMarkdown, innerMarkdown, coreInfo.plainText, childTitle);

            if (newMarkdown) {
                await this.updateBlockText(coreInfo.targetId, newMarkdown);
                showMessage(`已同步标题（保留格式）: ${childTitle}`);
            } else {
                showMessage("❌ 格式过于复杂，请手动修改以防破坏格式", -1, "error");
            }
        } else {
            showMessage("标题一致，无需更新");
        }
    }

    // --- 场景 2: 底部标题同步 (富文本 <-> 富文本) ---
    // [FIXED] 逻辑：全量同步 Markdown，底部标题不带 🔸

    async handlePushToBottom(blockId, coreInfo, attrs) {
        // [FIX] 1. 去掉 🔸 2. 直接使用 richText (Markdown)
        // 结果：# aaa**bold**bb
        const content = `# ${coreInfo.richText}`; 
        
        const boundBlockId = attrs[ATTR_LOCAL_BLOCK];

        if (boundBlockId && await this.checkBlockExists(boundBlockId)) {
            await this.updateBlockText(boundBlockId, content);
            showMessage("已更新底部标题 (全量)");
        } else {
            const rootId = await this.getRootId(blockId);
            const newIds = await this.appendBlock(rootId, content);
            const newBlockId = newIds[0].doOperations[0].id;
            await this.setBlockAttr(blockId, ATTR_LOCAL_BLOCK, newBlockId);
            await this.setBlockAttr(newBlockId, ATTR_PARENT_BLOCK, blockId);
            showMessage("✅ 已创建底部标题");
        }
    }

    async handlePullFromBottom(blockId, coreInfo, attrs) {
        const boundBlockId = attrs[ATTR_LOCAL_BLOCK];
        if (!boundBlockId) { showMessage("未绑定底部标题"); return; }

        const rows = await this.sql(`SELECT markdown FROM blocks WHERE id = '${boundBlockId}' LIMIT 1`);
        if (!rows || rows.length === 0) return;
        
        const boundMarkdown = rows[0].markdown;
        
        // [FIX] 底部标题现在没有 🔸 了，我们只需要去掉 # 标记
        // 剩下的全部内容就是 richText
        let extractedRichText = boundMarkdown.replace(/^#+\s+/, "").trim();

        if (extractedRichText) {
            // [FIX] 回写时，将提取到的纯 Markdown 包裹在 🔸 中
            // 结果：* 🔸aaa**bold**bb🔸
            const newMarkdown = this.wrapContent(coreInfo.listMarker, extractedRichText);
            
            await this.updateBlockText(coreInfo.targetId, newMarkdown);
            showMessage("已从底部拉取更新 (全量)");
        }
    }

    // ============================================================
    // 🛠️ SQL 核心引擎
    // ============================================================

    async getCoreContentInfo(blockId) {
        const attrs = await this.getBlockAttrs(blockId);
        const type = attrs.type;
        let targetId = blockId;
        let isChildBlock = false;

        // 定位子段落
        if (type === "NodeListItem") {
            const children = await this.sql(`SELECT id FROM blocks WHERE parent_id = '${blockId}' ORDER BY sort ASC LIMIT 1`);
            if (children && children.length > 0) {
                targetId = children[0].id; 
                isChildBlock = true;
            }
        }

        // 查库
        const row = await this.sql(`SELECT markdown, content FROM blocks WHERE id = '${targetId}' LIMIT 1`);
        if (!row || row.length === 0) return null;

        const dbMarkdown = row[0].markdown || ""; 
        const dbContent = row[0].content || "";   

        // 提取列表标记 (用于回写)
        let listMarker = "";
        if (!isChildBlock) {
            const match = dbMarkdown.match(/^(\s*([-*+]|\d+\.)\s+)/);
            if (match) listMarker = match[1];
        }

        let richText = ""; 
        let plainText = ""; 
        let hasWrapper = false;

        // 解析内容
        if (dbContent.includes(BRACKET)) {
            hasWrapper = true;
            plainText = dbContent.replaceAll(BRACKET, "").trim();
            // 从 Markdown 提取 🔸 中间的部分 (包含加粗等符号)
            const mdMatch = dbMarkdown.match(new RegExp(`${BRACKET}(.*?)${BRACKET}`));
            richText = mdMatch ? mdMatch[1] : plainText;
        } else {
            hasWrapper = false;
            plainText = dbContent.trim(); 
            // 尚未包裹，去除头部标记和属性
            richText = dbMarkdown.replace(/^(\s*([-*+]|\d+\.|#+)\s+)/, "").replace(/\{:.*?\}/g, "").trim();
        }

        return {
            sourceId: blockId,
            targetId: targetId,
            listMarker: listMarker,
            hasWrapper: hasWrapper,
            plainText: plainText, 
            richText: richText    
        };
    }

    // ============================================================
    // 🔌 Helpers
    // ============================================================

    async sql(stmt) { return (await this.post("/api/query/sql", { stmt })); }
    async getBlockAttrs(id) { return await this.post("/api/attr/getBlockAttrs", { id }); }
    async setBlockAttr(id, key, value) { return await this.post("/api/attr/setBlockAttrs", { id, attrs: { [key]: value } }); }
    async updateBlockText(id, text) { return await this.post("/api/block/updateBlock", { id, dataType: "markdown", data: text }); }
    async createDocWithMd(notebook, path, markdown) { return await this.post("/api/filetree/createDocWithMd", { notebook, path, markdown }); }
    async renameDocByID(id, title) { return await this.post("/api/filetree/renameDocByID", { id, title }); }
    async getHPathByID(id) { return await this.post("/api/filetree/getHPathByID", { id }); }
    async getPathByID(id) { return await this.post("/api/filetree/getPathByID", { id }); }
    async getRootId(id) { const r = await this.sql(`SELECT root_id FROM blocks WHERE id = '${id}' LIMIT 1`); return r.length > 0 ? r[0].root_id : null; }
    async checkBlockExists(id) { const r = await this.sql(`SELECT id FROM blocks WHERE id = '${id}' LIMIT 1`); return r.length > 0; }
    async appendBlock(parentId, data) { return await this.post("/api/block/appendBlock", { parentID: parentId, dataType: "markdown", data }); }
    async post(url, data) {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        const res = await response.json();
        if (res.code !== 0) throw new Error(res.msg);
        return res.data;
    }
}

module.exports = ListBlockPlugin;