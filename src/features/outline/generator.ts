import { settings } from "../../core/settings";

function filterIAL(ialStr: string) {
    if (!ialStr) return "";
    const whitelist = new Set(["style", "class"]);
    
    const parts = ialStr.match(/(\S+?)=\"([\s\S]*?)\"/g);
    if (!parts) return "";
    
    const filtered = parts.filter(part => {
        const key = part.match(/^(\S+?)=/)?.[1];
        return key && whitelist.has(key);
    });
    
    return filtered.join(" ");
}

function extractHeadingContent(markdown: string) {
    if (!markdown) return "";
    let content = markdown.replace(/^#+\s+/, "").trim();
    content = content.replace(/\s*\{:[^}]+\}\s*$/, "").trim();
    return content;
}

export function generateOutlineMarkdown(outlineData: any[], tab: number, stab: number, extraData?: Record<string, { ial: string, markdown: string }>, existingAnchors?: Map<string, string>): string {
    let data = "";
    tab++;

    for (let outline of outlineData) {
        let id = outline.id;
        let name = "";
        let ial = "";

        if (extraData && extraData[id]) {
            name = extractHeadingContent(extraData[id].markdown) || (outline.depth == 0 ? outline.name : outline.content);
            ial = filterIAL(extraData[id].ial);
        } else {
            name = outline.depth == 0 ? outline.name : outline.content;
        }

        let indent = "";
        let subOutlineCount = outline.count;
        for (let n = 1; n <= stab; n++) {
            indent += '    ';
        }

        indent += "> ";

        for (let n = 1; n < tab - stab; n++) {
            indent += '    ';
        }

        let listType = settings.get("listTypeOutline") == "unordered" ? true : false;
        let listMarker = listType ? "* " : "1. ";

        data += indent + listMarker;

        let outlineType = settings.get("outlineType"); // "copy", "ref", "embed" -> actually stored as string in settings usually?
        // SettingsProperty defines outlineType as string. "ref", "embed", "copy".
        
        let ialStr = ial ? `\n${indent}   {: ${ial}}` : "";

        if (outlineType == "copy") {
            data += `${name}((${id} '*'))${ialStr}\n`;
        } else {
            let iconEnabled = settings.get("iconOutline") ?? false;
            let anchorText = existingAnchors?.get(id);

            // If icons disabled, ignore default separator
            if (!iconEnabled && anchorText === "➖") {
                anchorText = undefined;
            }

            if (!anchorText) {
                if (iconEnabled) {
                    anchorText = "➖";
                } else {
                    anchorText = name;
                }
            }

            let isAnchorName = (anchorText === name);
            let safeAnchorText = anchorText.replace(/"/g, "&quot;");

            if (outlineType == "ref") { // Link
                if (isAnchorName) {
                    data += `[${anchorText}](siyuan://blocks/${id})${ialStr}\n`;
                } else {
                    data += `[${anchorText}](siyuan://blocks/${id}) ${name}${ialStr}\n`;
                }
            } else { // Block Ref (Embed/Static Ref)
                if (isAnchorName) {
                    data += `((${id} "${safeAnchorText}"))${ialStr}\n`;
                } else {
                    data += `((${id} "${safeAnchorText}")) ${name}${ialStr}\n`;
                }
            }
        }
        
        if (subOutlineCount > 0) {
            if (outline.depth == 0) {
                data += generateOutlineMarkdown(outline.blocks, tab, stab, extraData, existingAnchors);
            } else {
                data += generateOutlineMarkdown(outline.children, tab, stab, extraData, existingAnchors);
            }
        }
    }
    return data;
}
