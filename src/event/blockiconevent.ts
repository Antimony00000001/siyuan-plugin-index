import { insertDataSimple } from "../creater/createIndex";
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
    // Matches leading emojis (like 📑, 📄) or :word: patterns
    // Also matches `[<anything>](siyuan://blocks/<id>) ` pattern to catch previously generated links with icons
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

//目录栈
let indexStack : IndexStack;

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

    // Existing Doc Builder Logic
    if (blockElements.length === 1 && blockType === "NodeList" && settings.get("docBuilder")) {
        menu.addItem({
            icon: "iconList",
            label: i18n.settingsTab.items.docBuilder.title,
            click: async () => {
                await parseBlockDOM(detail);
            }
        });
    }

    // New Smart Selector Logic
    if (blockType !== "NodeList" && blockType !== "NodeListItem") return;

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
        cleanText = cleanText.replace(/^\s*\*\*.*\*\*\s*$/,"" ).trim();
        cleanText = cleanText.replace(/^\s*\*.*\*\s*$/,"" ).trim();
        cleanText = cleanText.replace(/^\s*__.*__\s*$/,"" ).trim();
        cleanText = cleanText.replace(/^\s*_.+_\s*$/,"" ).trim();
        cleanText = cleanText.replace(/^\s*~~.*~~\[\s*$/,"" ).trim();
        cleanText = cleanText.replace(/^\s*`.*`\s*$/,"" ).trim();
        cleanText = cleanText.replace(/^\s*<.*>\s*$/,"" ).trim();
        cleanText = cleanText.replace(/^\s*\[.*?\].*\)\s*$/,"" ).trim();

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
        if (!containerAttrs[ATTR_INDEX]) return;
        const docId = containerAttrs[ATTR_INDEX];
        const docAttrsRes = await client.getBlockAttrs({ id: docId });
        const docAttrs = docAttrsRes.data;
        
        if (!docAttrs.title) return;
        const newTitle = docAttrs.title;
        
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

            if (calculatedPureText && contentMd.includes(calculatedPureText)) {
                 if (calculatedPureText !== newTitle) {
                    bodyMd = bodyMd.replace(calculatedPureText, newTitle);
                 }
                 isSuccess = true;
            } else {
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
                    await client.updateBlock({ id: core.contentId, dataType: "markdown", data: finalMd });
                }
                
                if (Object.keys(validStyles).length > 0) {
                     await client.setBlockAttrs({ id: core.contentId, attrs: validStyles });
                }
                isHandled = true;
            }
        }

        if (isHandled) return;

        let baseMd = await this.constructListItemMarkdown(
            core.containerId, 
            outlineId, 
            newContentMd
        );

        const finalMd = baseMd + (originalIal ? " " + originalIal : "");
        await client.updateBlock({ id: core.contentId, dataType: "markdown", data: finalMd });
        
        if (Object.keys(validStyles).length > 0) {
            await client.setBlockAttrs({ id: core.contentId, attrs: validStyles });
        }
    }

    stripMarkdownSyntax(md: string) {
        if (!md) return "";
        let plain = md;
        plain = plain.replace(/(\$\$|__|~~|==)/g, ""); 
        plain = plain.replace(/(\.|_)/g, "");
        plain = plain.replace(/<[^>]+>/g, "");
        plain = plain.replace(/\*?\[([^\]]*?)\]\([^)]*\)/g, "");
        plain = plain.replace(/!\[([^\]]*?)\]\([^)]*\)/g, "");
        plain = plain.replace(/`([^`]+)`/g, "");
        plain = plain.replace(/&quot;/g, '"').replace(/&apos;/g, "'" ).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
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
        plain = plain.replace(/(\$\$|__|\*|_|~~)/g, ""); 
        plain = plain.replace(/\*?\[([^\]]*?)\]\([^)]*\)/g, "");
        plain = plain.replace(/!\[([^\]]*?)\]\([^)]*\)/g, "");
        plain = plain.replace(/`([^`]+)`/g, "");
        plain = plain.replace(/<[^>]+>/g, "");
        plain = plain.replace(/&quot;/g, '"').replace(/&apos;/g, "'" ).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

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

/**
 * 解析detail中块的DOM
 * @param detail 
 */
async function parseBlockDOM(detail: any) {
    indexStack = new IndexStack();
    indexStack.notebookId = detail.protyle.notebookId;
    let docId = detail.blockElements[0].getAttribute("data-node-id");
    let block = detail.blockElements[0].childNodes;
    let blockElement = detail.blockElements[0];

    let initialListType = "unordered"; // Default
    const subType = blockElement.getAttribute('data-subtype');
    if (subType === 'o') {
        initialListType = "ordered";
    } else if (subType === 't') {
        initialListType = "task";
    }
    indexStack.basePath = await getRootDoc(detail.protyle.block.rootID);
    // We still need docData for pPath, so let's get it separately
    let docDataForPath = await client.getBlockInfo({
        id: detail.protyle.block.rootID
    });
    indexStack.pPath = docDataForPath.data.path.slice(0, -3);
    await parseChildNodes(block,indexStack,0,initialListType);
    await stackPopAll(indexStack);

    // Call the new function to reconstruct the markdown for the list
    let reconstructedMarkdown = await reconstructListMarkdownWithLinks(detail.blockElements[0], indexStack);

    // Update the original list block with the reconstructed markdown
    if (reconstructedMarkdown !== '') {
        await client.updateBlock({
            id: docId, // Update the root NodeList block
            data: reconstructedMarkdown,
            dataType: 'markdown',
        });
    } else {
        client.pushErrMsg({
            msg: i18n.errorMsg_miss,
            timeout: 3000
        });
    }
}

async function parseChildNodes(childNodes: any, currentStack: IndexStack, tab = 0, parentListType: string) {
    tab++;
    for (const childNode of childNodes) { // childNode is a NodeListItem
        if (childNode.getAttribute('data-type') == "NodeListItem") {
            let sChildNodes = childNode.childNodes;
            let itemText = "";
            let existingBlockId = ""; // This is for the generated page ID.
            let subListNodes = [];
            let cleanMarkdown = "";

            for (const sChildNode of sChildNodes) {
                if (sChildNode.getAttribute('data-type') == "NodeParagraph") {
                    const paragraphId = sChildNode.getAttribute('data-node-id');
                    const paragraphContent = sChildNode.innerHTML;

                    try {
                        const kramdownResponse = await client.getBlockKramdown({ id: paragraphId });
                        if (kramdownResponse?.data?.kramdown) {
                            let kramdown = kramdownResponse.data.kramdown.split('\n')[0];

                            const finalizedMatch = kramdown.match(/^\\[(.*?)\\]\(siyuan:\/\/blocks\/([a-zA-Z0-9-]+)\)\s*➖\s*(.*)$/s);

                            if (finalizedMatch) { // Run 2+ with the "ICON ➖ CONTENT" format
                                existingBlockId = finalizedMatch[2]; // The generated page ID
                                cleanMarkdown = finalizedMatch[3].trim();   // The original content part
                                itemText = window.Lute.BlockDOM2Content(paragraphContent).replace(/^.*?➖\s*/, "").trim();
                            } else { // First run or other format
                                cleanMarkdown = kramdown.replace(/\s*{:.*?}\s*/g, '').trim();
                                itemText = stripIconPrefix(window.Lute.BlockDOM2Content(paragraphContent)).trim();
                            }
                        }
                    } catch (e) {
                        console.error(`[Parse][Error] Failed to get kramdown for ${paragraphId}`, e);
                    }

                    if (!cleanMarkdown) {
                        cleanMarkdown = itemText; // Fallback
                    }

                } else if (sChildNode.getAttribute('data-type') == "NodeList") {
                    subListNodes.push(sChildNode);
                }
            }

            let currentItemType = parentListType;
            let taskStatus = "";
            if (currentItemType === "task") {
                const taskMarkerElement = childNode.querySelector('[data-type="NodeTaskListItemMarker"]');
                taskStatus = (taskMarkerElement && taskMarkerElement.getAttribute('data-task') === 'true') ? "[x]" : "[ ]";
            }
            let existingSubFileCount = 0;
            
            let contentBlockId;
            const refMatch = cleanMarkdown.match(/\(\((.*?)\s/);
            if (refMatch) {
                contentBlockId = refMatch[1];
            } else {
                const linkMatch = cleanMarkdown.match(/siyuan:\/\/blocks\/(.*?)\)/);
                if (linkMatch) {
                    contentBlockId = linkMatch[1];
                }
            }

            if (contentBlockId) {
                try {
                    let blockInfo = await client.getBlockInfo({ id: contentBlockId });
                    if (blockInfo && blockInfo.data) {
                        existingSubFileCount = blockInfo.data.subFileCount || 0;
                    }
                } catch(e) { /* ignore if block not found */ }
            }
            let existingIcon = existingSubFileCount > 0 ? "📑" : "📄";

            let item = new IndexStackNode(tab, itemText, currentItemType, taskStatus, existingIcon, existingSubFileCount, existingBlockId, cleanMarkdown);
            currentStack.push(item);

            for (const subListNode of subListNodes) {
                let subListType = "unordered";
                const subType = subListNode.getAttribute('data-subtype');
                if (subType === 'o') subListType = "ordered";
                else if (subType === 't') subListType = "task";
                await parseChildNodes(subListNode.childNodes, item.children, tab, subListType);
            }
        }
    }
}

async function getRootDoc(id:string){
    let response = await client.sql({
        stmt: `SELECT hpath FROM blocks WHERE id = '${id}'`
    });
    let result = response.data[0];
    return result?.hpath;
}

async function createDoc(notebookId:string,hpath:string){
    const escapedHpath = hpath.replace(/'/g, "''");
    let existingDocResponse = await client.sql({
        stmt: `SELECT id FROM blocks WHERE hpath = '${escapedHpath}' AND type = 'd' AND box = '${notebookId}'`
    });

    if (existingDocResponse.data && existingDocResponse.data.length > 0) {
        return existingDocResponse.data[0].id;
    } else {
        await new Promise(resolve => setTimeout(resolve, 50));
        let response = await client.createDocWithMd({
            markdown: "",
            notebook: notebookId,
            path: hpath
        });
        return response.data;
    }
}

async function stackPopAll(stack:IndexStack){
    for (let i = stack.stack.length - 1; i >= 0; i--) {
        const item = stack.stack[i];
        const text = item.text;
        const subPath = stack.basePath+"/"+text;
        
        if (!item.blockId) {
            item.blockId = await createDoc(indexStack.notebookId, subPath);
        }
        let currentBlockId = item.blockId;

        item.documentPath = stack.pPath + "/" + currentBlockId;

        try {
            let blockInfo = await client.getBlockInfo({ id: currentBlockId });
            let docsInParent = await client.listDocsByPath({
                notebook: indexStack.notebookId,
                path: stack.pPath
            });

            let foundDocIcon = null;
            if (docsInParent?.data?.files) {
                const matchingDoc = docsInParent.data.files.find(doc => doc.id === currentBlockId);
                if (matchingDoc) foundDocIcon = matchingDoc.icon;
            }

            if (blockInfo?.data) {
                item.subFileCount = blockInfo.data.subFileCount || 0;
                item.icon = foundDocIcon || (item.subFileCount > 0 ? "📑" : "📄");
            }
        } catch (e) {
            console.error(`[StackPop] Error processing block info for ${currentBlockId}:`, e);
            item.icon = item.subFileCount > 0 ? "📑" : "📄"; // Fallback icon
        }

        if(!item.children.isEmpty()){
            item.children.basePath = subPath;
            item.children.pPath = item.documentPath;
            await stackPopAll(item.children);
        }
    }
}

async function reconstructListMarkdownWithLinks(originalListElement: HTMLElement, currentStack: IndexStack, indentLevel: number = 0, orderedListCounters: { [key: number]: number } = {}): Promise<string> {
    let markdown = "";
    const originalListItems = originalListElement.children;
    let stackIndex = 0;

    if (currentStack.stack.length > 0 && currentStack.stack[0].listType === "ordered" && !orderedListCounters[indentLevel]) {
        orderedListCounters[indentLevel] = 1;
    }

    for (const originalListItem of Array.from(originalListItems)) {
        if (originalListItem instanceof HTMLElement && originalListItem.getAttribute('data-type') === "NodeListItem") {
            const paragraphElement = originalListItem.querySelector('[data-type="NodeParagraph"]');
            if (paragraphElement) {
                let itemTextFromDOM = window.Lute.BlockDOM2Content(paragraphElement.innerHTML);
                
                let comparableItemText = itemTextFromDOM.includes(' ➖ ')
                    ? itemTextFromDOM.replace(/^.*?➖\s*/, "").trim()
                    : stripIconPrefix(itemTextFromDOM);

                const correspondingIndexNode = currentStack.stack[stackIndex];

                if (correspondingIndexNode && correspondingIndexNode.text === comparableItemText.replace(/!\[\]\([^)]*\)/g, '').trim() && correspondingIndexNode.blockId) {
                    let prefix = "    ".repeat(indentLevel);
                    if (correspondingIndexNode.listType === "ordered") {
                        prefix += `${orderedListCounters[indentLevel]++}. `; 
                    } else if (correspondingIndexNode.listType === "task") {
                        prefix += `- ${correspondingIndexNode.taskStatus} `; 
                    } else { // unordered
                        prefix += "- ";
                    }
                    
                    const gdcIconInput = correspondingIndexNode.icon;
                    const gdcHasChildInput = correspondingIndexNode.subFileCount != undefined && correspondingIndexNode.subFileCount != 0;
                    let iconPrefix = `${getProcessedDocIcon(gdcIconInput, gdcHasChildInput)} `;
                    
                    const node = correspondingIndexNode;

                    markdown += `${prefix}[${iconPrefix.trim()}](siyuan://blocks/${node.blockId}) ➖ ${node.originalMarkdown}\n`;
                    
                    const nestedListElement = originalListItem.querySelector('[data-type="NodeList"]');
                    if (nestedListElement instanceof HTMLElement && !correspondingIndexNode.children.isEmpty()) {
                        markdown += await reconstructListMarkdownWithLinks(nestedListElement, correspondingIndexNode.children, indentLevel + 1, { ...orderedListCounters });
                    }
                }
            }
            stackIndex++;
        }
    }
    return markdown;
}