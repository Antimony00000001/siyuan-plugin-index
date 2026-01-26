import { IndexStackNode, IndexStack } from "../indexnode";
import { settings } from "../settings";
import { client, i18n } from "../utils";
import { getProcessedDocIcon } from "../creater/createIndex";

// Constants
const ATTR_INDEX = "custom-index-id";
const ATTR_OUTLINE = "custom-outline-id";
const SEP_CHAR = "➖";
const DEFAULT_ICON = "📄";

// Helper to strip icon prefixes from text
const stripIconPrefix = (text: string) => {
    const iconOrLinkRegex = /^(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|:\w+:|\[.*?\]\(siyuan:\/\/blocks\/.*?\))\s*/;
    return text.replace(iconOrLinkRegex, '').trim();
};

// API Helper
async function post(url: string, data: any) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    const res = await response.json();
    if (res.code !== 0) throw new Error(res.msg);
    return res.data;
}

/**
 * 块标菜单回调
 * @param detail 事件细节
 * @returns void
 */
export function buildDoc({ detail }: any) {
    const { menu, blockElements } = detail;
    if (!blockElements || blockElements.length === 0) return;

    const blockElement = blockElements[0];
    const blockId = blockElement.getAttribute("data-node-id");
    const blockType = blockElement.getAttribute("data-type");

    // Only show for List or ListItem
    if (blockType !== "NodeList" && blockType !== "NodeListItem") return;

    // Add Smart Selector menu items
    menu.addSeparator();

    menu.addItem({
        icon: "iconUpload",
        label: "📤 构建子文档",
        click: () => syncManager(blockId, blockType, "PUSH_TO_DOC")
    });

    menu.addItem({
        icon: "iconDownload",
        label: "📥 从子文档拉取",
        click: () => syncManager(blockId, blockType, "PULL_FROM_DOC")
    });

    menu.addItem({
        icon: "iconRef",
        label: "👇 构建标题行",
        click: () => syncManager(blockId, blockType, "PUSH_TO_BOTTOM")
    });

    menu.addItem({
        icon: "iconRefresh",
        label: "👆 从标题行拉取",
        click: () => syncManager(blockId, blockType, "PULL_FROM_BOTTOM")
    });
}

async function syncManager(sourceBlockId: string, sourceType: string, actionType: string) {
    try {
      const processor = new ItemProcessor();
      await processor.processRecursive(sourceBlockId, sourceType, actionType);
      
      if (processor.errors.length > 0) {
          client.pushMsg({
              msg: `⚠️ 部分条目因格式复杂未更新文本 (x${processor.errors.length})，仅更新了图标`,
              timeout: 5000
          });
      } else {
          client.pushMsg({
              msg: "✅ 同步完成",
              timeout: 3000
          });
      }
    } catch (e) {
      console.error(e);
      client.pushErrMsg({
          msg: `同步失败: ${e.message}`,
          timeout: 5000
      });
    }
}

class ItemProcessor {
    errors: string[] = [];

    async processRecursive(blockId: string, type: string, actionType: string, ctx: any = null) {
        if (!ctx) {
            ctx = { previousId: null, parentId: null, level: 1 };
        }
        
        const shouldReverse = actionType === "PUSH_TO_DOC";

        if (type === "NodeListItem" || type === "i") {
            const resultId = await this.processSingleItem(blockId, actionType, ctx);
            if (resultId) ctx.previousId = resultId;

            const childCtx = {
                previousId: ctx.previousId,
                parentId: (actionType === "PUSH_TO_DOC" || actionType === "PULL_FROM_DOC") ? resultId : ctx.parentId,
                level: ctx.level + 1
            };

            let childrenRes = await client.sql({
                stmt: `SELECT id, type, subtype FROM blocks WHERE parent_id = '${blockId}' AND type = 'l' ORDER BY sort ASC`
            });
            let children = childrenRes.data || [];
            if (shouldReverse) children = children.reverse();

            for (const child of children) {
                await this.processRecursive(child.id, "NodeList", actionType, childCtx);
                ctx.previousId = childCtx.previousId;
            }
            return resultId;

        } else if (type === "NodeList" || type === "l") { 
            let childrenRes = await client.sql({
                stmt: `SELECT id, type FROM blocks WHERE parent_id = '${blockId}' AND type = 'i' ORDER BY sort ASC`
            });
            let children = childrenRes.data || [];
            if (shouldReverse) children = children.reverse();
            
            for (const child of children) {
                await this.processRecursive(child.id, "NodeListItem", actionType, ctx);
            }
        }
    }

    async processSingleItem(listItemId: string, actionType: string, ctx: any) {
        const core = await this.getCoreContentInfo(listItemId);
        if (!core) return ctx.previousId;

        const containerAttrsRes = await client.getBlockAttrs({ id: core.containerId });
        const containerAttrs = containerAttrsRes.data;
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

    async handlePushToBottom(core: any, containerAttrs: any, ctx: any) {
        let cleanText = core.syncText;
        cleanText = cleanText.replace(/^[📄➖\s]+/, ""); 
        cleanText = cleanText.replace(/^\s*\*\*.*\*\*\s*$/,"").trim();
        cleanText = cleanText.replace(/^\s*\*.*\*\s*$/,"").trim();
        cleanText = cleanText.replace(/^\s*__.*__\s*$/,"").trim();
        cleanText = cleanText.replace(/^\s*_.+_\s*$/,"").trim();
        cleanText = cleanText.replace(/^\s*~~.*~~\s*$/,"").trim();
        cleanText = cleanText.replace(/^\s*`.*`\s*$/,"").trim();
        cleanText = cleanText.replace(/^\s*<.*>\s*$/,"").trim();
        cleanText = cleanText.replace(/^\s*\[.*?\]\(.*\)\s*$/,"").trim();

        if (!cleanText) cleanText = "Untitled";

        const prefix = "#".repeat(Math.min(ctx.level, 6));
        const titleContent = `${prefix} ${cleanText}`; 
        
        const coreAttrsRes = await client.getBlockAttrs({ id: core.contentId });
        const stylesToKeep = this.filterSystemAttrs(coreAttrsRes.data);
        let targetId = containerAttrs[ATTR_OUTLINE];
        const previousTargetId = ctx.previousId;

        let targetExists = false;
        if (targetId) {
             const checkRes = await client.sql({ stmt: `SELECT id FROM blocks WHERE id = '${targetId}' LIMIT 1` });
             targetExists = !!checkRes.data[0];
        }

        if (!targetId || !targetExists) {
            let r;
            if (previousTargetId) {
                r = await client.insertBlock({ previousID: previousTargetId, dataType: "markdown", data: titleContent });
            } else {
                const rootIdRes = await client.sql({ stmt: `SELECT root_id FROM blocks WHERE id = '${core.containerId}' LIMIT 1` });
                const rootId = rootIdRes.data[0]?.root_id;
                r = await client.appendBlock({ parentID: rootId, dataType: "markdown", data: titleContent });
            }
            
            targetId = r?.data?.[0]?.doOperations?.[0]?.id;
            if (targetId) {
                await client.setBlockAttrs({ id: core.containerId, attrs: { [ATTR_OUTLINE]: targetId } });
                if (Object.keys(stylesToKeep).length > 0) await client.setBlockAttrs({ id: targetId, attrs: stylesToKeep });
            }
        } else {
            await client.updateBlock({ id: targetId, dataType: "markdown", data: titleContent });
            if (Object.keys(stylesToKeep).length > 0) await client.setBlockAttrs({ id: targetId, attrs: stylesToKeep });
        }

        const finalMd = await this.constructListItemMarkdown(core.containerId, targetId, core.syncMd);
        await client.updateBlock({ id: core.contentId, dataType: "markdown", data: finalMd });
        if (Object.keys(stylesToKeep).length > 0) await client.setBlockAttrs({ id: core.contentId, attrs: stylesToKeep });

        return targetId;
    }

    async handlePushToDoc(core: any, containerAttrs: any, ctx: any) {
        const title = core.syncText;
        if (!title) return null;

        const coreAttrsRes = await client.getBlockAttrs({ id: core.contentId });
        const stylesToKeep = this.filterSystemAttrs(coreAttrsRes.data);
        let docId = containerAttrs[ATTR_INDEX];
        
        if (docId) {
            const checkRes = await client.sql({ stmt: `SELECT id FROM blocks WHERE id = '${docId}' LIMIT 1` });
            if (!checkRes.data[0]) docId = null;
        }

        if (docId) {
            await client.renameDoc({ id: docId, title: title });
            const newMd = await this.constructListItemMarkdown(core.containerId, containerAttrs[ATTR_OUTLINE], core.syncMd);
            await client.updateBlock({ id: core.contentId, dataType: "markdown", data: newMd });
            if(Object.keys(stylesToKeep).length > 0) await client.setBlockAttrs({ id: core.contentId, attrs: stylesToKeep });
            return docId;
        }

        let notebook, path;
        if (ctx.parentId) {
            const parentPathRes = await post("/api/filetree/getPathByID", { id: ctx.parentId });
            const parentHPathRes = await post("/api/filetree/getHPathByID", { id: ctx.parentId });
            if (parentPathRes && parentHPathRes) {
                notebook = parentPathRes.notebook;
                path = `${parentHPathRes}/${title}`;
            }
        } 
        if (!notebook || !path) {
            const hPathRes = await post("/api/filetree/getHPathByID", { id: core.containerId });
            const pathRes = await post("/api/filetree/getPathByID", { id: core.containerId });
            notebook = pathRes.notebook;
            path = `${hPathRes}/${title}`;
        }

        const newIdRes = await client.createDocWithMd({ notebook, path, markdown: "" });
        const newId = newIdRes.data;
        if (newId) {
            await client.setBlockAttrs({ id: core.containerId, attrs: { [ATTR_INDEX]: newId } });
            const newMd = await this.constructListItemMarkdown(core.containerId, containerAttrs[ATTR_OUTLINE], core.syncMd);
            await client.updateBlock({ id: core.contentId, dataType: "markdown", data: newMd });
            if(Object.keys(stylesToKeep).length > 0) await client.setBlockAttrs({ id: core.contentId, attrs: stylesToKeep });
            return newId;
        }
        return null;
    }

    async handlePullFromDoc(core: any, containerAttrs: any) {
        console.log("[Sync] PullFromDoc Start", core.contentId);
        if (!containerAttrs[ATTR_INDEX]) return;
        const docId = containerAttrs[ATTR_INDEX];
        const docAttrsRes = await client.getBlockAttrs({ id: docId });
        const docAttrs = docAttrsRes.data;
        
        if (!docAttrs.title) return;
        const newTitle = docAttrs.title;
        console.log("[Sync] New Title from Doc:", newTitle);
        
        const newIconChar = this.resolveIcon(docAttrs.icon || DEFAULT_ICON);
        const newIconLink = `[${newIconChar}](siyuan://blocks/${docId})`;

        const currentAttrsRes = await client.getBlockAttrs({ id: core.contentId });
        const stylesToPreserve = this.filterSystemAttrs(currentAttrsRes.data);

        const ialRegex = /(?:^|\s)(\{:[^}]+\})\s*$/;
        const match = core.markdown.match(ialRegex);
        const originalIal = match ? match[1] : ""; 
        let bodyMd = core.markdown.replace(ialRegex, "").trimEnd();
        
        let isSuccess = false;

        if (core.hasSeparator) {
            const iconRegex = /^\s*\[.*?\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)/;
            if (iconRegex.test(bodyMd)) {
                bodyMd = bodyMd.replace(iconRegex, newIconLink);
            } else {
                bodyMd = newIconLink + " " + bodyMd.trimStart();
            }

            let contentMd = bodyMd;
            const extractIconRegex = /^\s*\[.*?\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)\s*/;
            contentMd = contentMd.replace(extractIconRegex, "");
            const extractSepRegex = /^\s*(\[➖\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)|➖)\s*/;
            contentMd = contentMd.replace(extractSepRegex, "");
            contentMd = contentMd.trim();

            const calculatedPureText = this.stripMarkdownSyntax(contentMd);
            console.log("[Sync] Content MD:", contentMd);
            console.log("[Sync] Calculated Pure Text:", calculatedPureText);
            console.log("[Sync] Check includes:", contentMd.includes(calculatedPureText));

            if (calculatedPureText && contentMd.includes(calculatedPureText)) {
                 if (calculatedPureText !== newTitle) {
                    console.log(`[Sync] Updating text: "${calculatedPureText}" -> "${newTitle}"`);
                    bodyMd = bodyMd.replace(calculatedPureText, newTitle);
                 }
                 isSuccess = true;
            } else {
                 console.log("[Sync] Continuity check failed. Complex format detected.");
                 if (calculatedPureText !== newTitle) {
                     this.errors.push(core.containerId);
                 }
            }
        }

        let finalMd = "";
        if (core.hasSeparator) {
             finalMd = bodyMd + (originalIal ? " " + originalIal : "");
        } else {
            let reconstructed = await this.constructListItemMarkdown(
                core.containerId, 
                containerAttrs[ATTR_OUTLINE], 
                newTitle
            );
            finalMd = reconstructed + (originalIal ? " " + originalIal : "");
        }

        await client.updateBlock({ id: core.contentId, dataType: "markdown", data: finalMd });

        if (Object.keys(stylesToPreserve).length > 0) {
            await client.setBlockAttrs({ id: core.contentId, attrs: stylesToPreserve });
        }
    }

    async handlePullFromBottom(core: any, containerAttrs: any) {
        if (!containerAttrs[ATTR_OUTLINE]) return;
        const outlineId = containerAttrs[ATTR_OUTLINE];
        const rowsRes = await client.sql({ stmt: `SELECT markdown FROM blocks WHERE id = '${outlineId}' LIMIT 1` });
        if (!rowsRes.data[0]) return;

        const newContentMd = this.cleanHeaderContent(rowsRes.data[0].markdown);
        
        const sourceAttrsRes = await client.getBlockAttrs({ id: outlineId });
        const validStyles = this.filterSystemAttrs(sourceAttrsRes.data);

        const ialRegex = /(?:^|\s)(\{:[^}]+\})\s*$/;
        const match = core.markdown.match(ialRegex);
        const originalIal = match ? match[1] : ""; 
        let bodyMd = core.markdown.replace(ialRegex, "").trimEnd();

        if (core.hasSeparator) {
            let contentMd = bodyMd;
            const extractIconRegex = /^\s*\[.*?\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)\s*/;
            contentMd = contentMd.replace(extractIconRegex, "");
            const extractSepRegex = /^\s*(\[➖\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)|➖)\s*/;
            contentMd = contentMd.replace(extractSepRegex, "");
            contentMd = contentMd.trim();
            
            // Use stripped syntax for continuity check
            let oldPureText = this.stripMarkdownSyntax(contentMd); 

            if (oldPureText && contentMd.includes(oldPureText)) {
                if (oldPureText !== newContentMd) { 
                    bodyMd = bodyMd.replace(oldPureText, newContentMd);
                }
            } else {
                // Continuity check failed (e.g. 1**2**), skip text update
                this.errors.push(core.containerId);
            }
        }

        // Construct final MD with potentially updated bodyMd (if check passed)
        // If check failed, bodyMd retains original text (preserving format)
        // Fallback reconstruction only happens if NO separator (which means it's not a synced item yet)
        let finalMd = "";
        if (core.hasSeparator) {
            finalMd = bodyMd + (originalIal ? " " + originalIal : "");
        } else {
            let baseMd = await this.constructListItemMarkdown(
                core.containerId, 
                outlineId, 
                newContentMd
            );
            finalMd = baseMd + (originalIal ? " " + originalIal : "");
        }

        await client.updateBlock({ id: core.contentId, dataType: "markdown", data: finalMd });
        
        if (Object.keys(validStyles).length > 0) {
            await client.setBlockAttrs({ id: core.contentId, attrs: validStyles });
        }
    }

    stripMarkdownSyntax(md: string) {
        if (!md) return "";
        let plain = md;
        plain = plain.replace(/(\*\*|__|~~|==)/g, ""); 
        plain = plain.replace(/(\*|_)/g, "");
        plain = plain.replace(/<[^>]+>/g, "");
        plain = plain.replace(/\[([^\]]*)\]\([^\)]+\)/g, "");
        plain = plain.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "");
        plain = plain.replace(/`([^`]+)`/g, "");
        plain = plain.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        // console.log(`[Sync] Strip MD: "${md}" -> "${plain.trim()}"`);
        return plain.trim();
    }

    async constructListItemMarkdown(containerId: string, headingId: string, syncText: string) {
        const parts = [];
        const containerAttrsRes = await client.getBlockAttrs({ id: containerId });
        const containerAttrs = containerAttrsRes.data;
        const docId = containerAttrs[ATTR_INDEX];
        
        if (docId) {
            let icon = DEFAULT_ICON;
            try {
                 const docInfoRes = await client.getBlockAttrs({ id: docId });
                 icon = this.resolveIcon(docInfoRes.data.icon || DEFAULT_ICON); 
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

    resolveIcon(iconStr: string) {
        if (!iconStr) return DEFAULT_ICON;
        if (iconStr.includes(".") || iconStr.includes("/")) return DEFAULT_ICON;
        const hexRegex = /^[0-9a-fA-F]+(-[0-9a-fA-F]+)*$/;
        if (hexRegex.test(iconStr)) {
            try { return String.fromCodePoint(...iconStr.split('-').map(s => parseInt(s, 16))); } 
            catch (e) { return iconStr; }
        }
        return iconStr;
    }

    async getCoreContentInfo(listItemId: string) {
        const selfRes = await client.sql({ stmt: `SELECT type FROM blocks WHERE id = '${listItemId}' LIMIT 1` });
        if (!selfRes.data[0] || selfRes.data[0].type !== "i") return null;

        const childrenRes = await client.sql({
            stmt: `SELECT id, type, markdown, content FROM blocks WHERE parent_id = '${listItemId}' AND type = 'p' ORDER BY sort ASC`
        });
        const children = childrenRes.data;
        if (!children || children.length === 0) return null;

        const sepRegex = /(\[➖\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)|➖)/;
        const iconRegex = /\s*\[.*?\]\(siyuan:\/\/blocks\/.*?\)\s*/; 

        let targetBlock = children.find((child: any) => {
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
        plain = plain.replace(/\[([^\]]*)\]\([^\)]+\)/g, "");
        plain = plain.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "");
        plain = plain.replace(/`([^`]+)`/g, "");
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

    cleanHeaderContent(md: string) {
        if (!md) return "";
        let content = md.replace(/^#+\s+/, "").trim();
        content = content.replace(/\s*\{:[^}]+\}\s*$/, "");
        return content.trim();
    }

    filterSystemAttrs(attrs: any) {
        const validAttrs: any = {};
        const ignoreList = ["id", "updated", "created", "hash", "box", "path", "hpath", "parent_id", "root_id", "type", "subtype", "sort", "markdown", "content", "name", "alias", "memo", ATTR_INDEX, ATTR_OUTLINE];
        for (const [key, val] of Object.entries(attrs)) {
            if (!ignoreList.includes(key)) validAttrs[key] = val;
        }
        return validAttrs;
    }
}