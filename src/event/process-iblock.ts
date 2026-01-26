import { client } from "../utils";

// Constants
export const ATTR_INDEX = "custom-index-subdoc-id";
export const ATTR_OUTLINE = "custom-index-heading-id";
export const SEP_CHAR = "➖";
export const DEFAULT_ICON = "📄";

// API Helper
export async function post(url: string, data: any) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    const res = await response.json();
    if (res.code !== 0) throw new Error(res.msg);
    return res.data;
}

export class IBlockProcessor {
    errors: string[];

    constructor(errors: string[]) {
        this.errors = errors;
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
        // Use syncMd (rich text) instead of syncText (plain text)
        let contentToPush = core.syncMd;
        
        // Fallback for empty content
        if (!contentToPush) contentToPush = "Untitled";

        const prefix = "#".repeat(Math.min(ctx.level, 6));
        const titleContent = `${prefix} ${contentToPush}`; 
        
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
        console.log(`[Sync Debug] handlePushToDoc - Core ContentId: ${core.contentId}, Extracted Title: "${title}", Extracted Icon: "${core.currentIcon}"`);
        
        if (!title) {
            console.log("[Sync Debug] Title is empty, aborting.");
            return null;
        }

        const coreAttrsRes = await client.getBlockAttrs({ id: core.contentId });
        const stylesToKeep = this.filterSystemAttrs(coreAttrsRes.data);
        let docId = containerAttrs[ATTR_INDEX];
        console.log(`[Sync Debug] Found ATTR_INDEX (DocId): ${docId}`);
        
        if (docId) {
            const checkRes = await client.sql({ stmt: `SELECT id FROM blocks WHERE id = '${docId}' LIMIT 1` });
            if (!checkRes.data[0]) {
                console.log(`[Sync Debug] DocId ${docId} not found in DB, resetting to null.`);
                docId = null;
            }
        }

        if (docId) {
            console.log(`[Sync Debug] Renaming existing doc ${docId} to "${title}"`);
            try {
                const pathRes = await post("/api/filetree/getPathByID", { id: docId });
                if (pathRes) {
                    const { notebook, path } = pathRes;
                    console.log(`[Sync Debug] Doc Path: ${path}, Notebook: ${notebook}`);
                    await client.renameDoc({ notebook, path, title });
                    console.log("[Sync Debug] Rename success.");
                    
                    // Verify title
                    const verifyRes = await client.getBlockAttrs({ id: docId });
                    const docIconRaw = verifyRes?.data?.icon || "";
                    console.log(`[Sync Debug] Post-rename Doc Status - Title: "${verifyRes?.data?.title}", Icon: "${docIconRaw}"`);

                    // Sync Icon if different
                    if (core.currentIcon) {
                        const resolvedDocIcon = this.resolveIcon(docIconRaw);
                        // Compare the resolved character (e.g. "😒") with core.currentIcon ("😒")
                        if (resolvedDocIcon !== core.currentIcon) {
                            console.log(`[Sync Debug] Icon mismatch. Doc (resolved): "${resolvedDocIcon}", List: "${core.currentIcon}". Updating...`);
                            
                            // Convert to hex for SiYuan API
                            const iconToSend = this.emojiToHex(core.currentIcon);
                            console.log(`[Sync Debug] Sending icon as hex: "${iconToSend}"`);

                            const setRes = await client.setBlockAttrs({ id: docId, attrs: { icon: iconToSend } });
                            console.log(`[Sync Debug] setBlockAttrs result:`, setRes);
                            
                            const finalVerify = await client.getBlockAttrs({ id: docId });
                            console.log(`[Sync Debug] Final Doc Icon in DB: "${finalVerify?.data?.icon}"`);
                        } else {
                            console.log("[Sync Debug] Icon already matches.");
                        }
                    }

                } else {
                    console.error("[Sync Debug] Failed to get path for doc rename.");
                }
            } catch (e) {
                console.error("[Sync Debug] Rename/Icon Sync failed:", e);
            }
            
            const newMd = await this.constructListItemMarkdown(core.containerId, containerAttrs[ATTR_OUTLINE], core.syncMd);
            console.log(`[Sync Debug] Updating List Item MD to: ${newMd}`);
            await client.updateBlock({ id: core.contentId, dataType: "markdown", data: newMd });
            if(Object.keys(stylesToKeep).length > 0) await client.setBlockAttrs({ id: core.contentId, attrs: stylesToKeep });
            return docId;
        }

        console.log("[Sync Debug] Creating new document...");
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
        console.log(`[Sync Debug] New Doc Path: ${path} in Notebook: ${notebook}`);

        const newIdRes = await client.createDocWithMd({ notebook, path, markdown: "" });
        const newId = newIdRes.data;
        console.log(`[Sync Debug] Created Doc ID: ${newId}`);

        if (newId) {
            await client.setBlockAttrs({ id: core.containerId, attrs: { [ATTR_INDEX]: newId } });
            
            // Initial Icon Sync for new doc
             if (core.currentIcon) {
                const iconToSend = this.emojiToHex(core.currentIcon);
                console.log(`[Sync Debug] Setting new doc icon: "${iconToSend}"`);
                await client.setBlockAttrs({ id: newId, attrs: { icon: iconToSend } });
            }

            const newMd = await this.constructListItemMarkdown(core.containerId, containerAttrs[ATTR_OUTLINE], core.syncMd);
            await client.updateBlock({ id: core.contentId, dataType: "markdown", data: newMd });
            if(Object.keys(stylesToKeep).length > 0) await client.setBlockAttrs({ id: core.contentId, attrs: stylesToKeep });
            return newId;
        }
        return null;
    }

    emojiToHex(icon: string) {
         if (!icon) return "";
         if (icon.includes(".") || icon.includes("/")) return icon; 
         // If it contains non-ASCII characters, assume it's a unicode emoji needing conversion
         if (/[^\u0000-\u007F]/.test(icon)) {
             return Array.from(icon).map(c => c.codePointAt(0)?.toString(16)).join("-");
         }
         return icon;
    }

    async handlePullFromDoc(core: any, containerAttrs: any) {
        console.log("[Sync Debug] PullFromDoc Start", core.contentId);
        if (!containerAttrs[ATTR_INDEX]) return;
        const docId = containerAttrs[ATTR_INDEX];
        const docAttrsRes = await client.getBlockAttrs({ id: docId });
        const docAttrs = docAttrsRes.data;
        
        if (!docAttrs.title) return;
        const newTitle = docAttrs.title;
        console.log("[Sync Debug] New Title from Doc:", newTitle);
        
        const newIconChar = this.resolveIcon(docAttrs.icon || DEFAULT_ICON);
        console.log(`[Sync Debug] Pulling Icon. Raw: "${docAttrs.icon}", Resolved: "${newIconChar}"`);

        const newIconLink = `[${newIconChar}](siyuan://blocks/${docId})`;

        const currentAttrsRes = await client.getBlockAttrs({ id: core.contentId });
        const stylesToPreserve = this.filterSystemAttrs(currentAttrsRes.data);

        const ialRegex = /(?:^|\s)(\{:[^}]+\})\s*$/;
        const match = core.markdown.match(ialRegex);
        const originalIal = match ? match[1] : ""; 
        let bodyMd = core.markdown.replace(ialRegex, "").trimEnd();
        
        let isSuccess = false;

        if (core.hasSeparator) {
            // ... existing logic ...
            const iconRegex = /^\s*\[.*?\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)/;
            if (iconRegex.test(bodyMd)) {
                console.log("[Sync Debug] Replacing existing icon link.");
                bodyMd = bodyMd.replace(iconRegex, newIconLink);
            } else {
                console.log("[Sync Debug] Prepending new icon link.");
                bodyMd = newIconLink + " " + bodyMd.trimStart();
            }

            let contentMd = bodyMd;
            const extractIconRegex = /^\s*\[.*?\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)\s*/;
            contentMd = contentMd.replace(extractIconRegex, "");
            const extractSepRegex = /^\s*(\[➖\]\(siyuan:\/\/blocks\/[a-zA-Z0-9-]+\)|➖)\s*/;
            contentMd = contentMd.replace(extractSepRegex, "");
            contentMd = contentMd.trim();

            const calculatedPureText = this.stripMarkdownSyntax(contentMd);
            console.log("[Sync Debug] Content MD:", contentMd);
            console.log("[Sync Debug] Calculated Pure Text:", calculatedPureText);
            console.log("[Sync Debug] Check includes:", contentMd.includes(calculatedPureText));

            if (calculatedPureText && contentMd.includes(calculatedPureText)) {
                 if (calculatedPureText !== newTitle) {
                    console.log(`[Sync Debug] Updating text: "${calculatedPureText}" -> "${newTitle}"`);
                    bodyMd = bodyMd.replace(calculatedPureText, newTitle);
                 }
                 isSuccess = true;
            } else {
                 console.log("[Sync Debug] Continuity check failed. Complex format detected.");
                 if (calculatedPureText !== newTitle) {
                     this.errors.push(core.containerId);
                 }
            }
        }

        let finalMd = "";
        if (core.hasSeparator) {
             finalMd = bodyMd + (originalIal ? " " + originalIal : "");
        } else {
            console.log("[Sync Debug] Reconstructing list item from scratch.");
            let reconstructed = await this.constructListItemMarkdown(
                core.containerId, 
                containerAttrs[ATTR_OUTLINE], 
                newTitle
            );
            finalMd = reconstructed + (originalIal ? " " + originalIal : "");
        }

        console.log(`[Sync Debug] Final MD for Pull: ${finalMd}`);
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

        // Always reconstruct for Rich Text sync, bypassing complex format checks
        let baseMd = await this.constructListItemMarkdown(
            core.containerId, 
            outlineId, 
            newContentMd
        );
        let finalMd = baseMd + (originalIal ? " " + originalIal : "");

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
                 const rawIcon = docInfoRes.data.icon || DEFAULT_ICON;
                 icon = this.resolveIcon(rawIcon);
                 console.log(`[Sync Debug] constructListItemMarkdown - DocId: ${docId}, Raw Icon: "${rawIcon}", Resolved Icon: "${icon}"`);
            } catch(e) {
                console.error("[Sync Debug] Failed to get doc icon:", e);
            }
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
        
        // Handle hex codes (including sequences like 1f469-200d-1f692)
        const hexRegex = /^[0-9a-fA-F]+(-[0-9a-fA-F]+)*$/;
        if (hexRegex.test(iconStr)) {
            try { 
                return String.fromCodePoint(...iconStr.split('-').map(s => parseInt(s, 16))); 
            } catch (e) { 
                console.warn("[Sync Debug] Failed to resolve icon hex:", iconStr, e);
                return iconStr; 
            }
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

        // Try to extract current icon from the beginning of MD
        // Matches standard emoji, :emoji:, or [icon](...)
        let currentIcon = null;
        const explicitIconRegex = /^(?:([\uD800-\uDBFF][\uDC00-\uDFFF])|(:[^:]+:)|\[(.*?)\]\(siyuan:\/\/blocks\/.*?\))\s*/;
        const iconMatch = tempMd.match(explicitIconRegex);
        console.log(`[Sync Debug] getCoreContentInfo - tempMd: "${tempMd}"`);
        console.log(`[Sync Debug] getCoreContentInfo - iconMatch:`, iconMatch);
        
        if (iconMatch) {
            // Group 1: Unicode Emoji, Group 2: :emoji:, Group 3: [icon](link) -> icon
            currentIcon = iconMatch[1] || iconMatch[2] || iconMatch[3];
            console.log(`[Sync Debug] getCoreContentInfo - Extracted currentIcon: "${currentIcon}"`);
        }

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
            content: content,
            currentIcon 
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