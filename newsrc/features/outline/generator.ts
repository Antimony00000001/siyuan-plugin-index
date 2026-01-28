import { settings } from "../../core/settings";

function filterIAL(ialStr: string) {
    if (!ialStr) return "";
    const ignoreAttrs = new Set(["id", "updated", "created", "hash", "box", "path", "hpath", "parent_id", "root_id", "type", "subtype", "sort", "custom-index-subdoc-id", "custom-index-heading-id", "title-img", "icon", "class", "refcount"]);
    
    const parts = ialStr.match(/(\S+?)=\"([\s\S]*?)\"/g);
    if (!parts) return "";
    
    const filtered = parts.filter(part => {
        const key = part.match(/^(\S+?)=/)?.[1];
        return key && !ignoreAttrs.has(key);
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

        let outlineType = settings.get("outlineType") == "copy" ? true : false;
        let ialStr = ial ? `\n${indent}   {: ${ial}}` : "";

        if (outlineType) {
            data += `${name}((${id} '*'))${ialStr}\n`;
        } else {
            outlineType = settings.get("outlineType") == "ref" ? true : false;
            let anchorText = existingAnchors?.get(id) || "➖";
            if (outlineType) {
                data += `[${anchorText}](siyuan://blocks/${id}) ${name}${ialStr}\n`;
            } else {
                let safeAnchorText = anchorText.replace(/"/g, "&quot;");
                data += `((${id} "${safeAnchorText}")) ${name}${ialStr}\n`;
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
