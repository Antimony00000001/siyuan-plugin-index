/**
 * Remove markdown syntax to get plain text
 * Note: This implementation removes links entirely `[text](url)` -> ``.
 * It is adapted from legacy `process-iblock.ts`.
 */
export function stripMarkdownSyntax(md: string) {
    if (!md) return "";
    let plain = md;
    plain = plain.replace(/(\*\*|__|~~|==)/g, ""); 
    plain = plain.replace(/(\*|_)/g, "");
    plain = plain.replace(/<[^>]+>/g, "");
    plain = plain.replace(/\[([^\]]*)\]\([^\)]+\)/g, "");
    plain = plain.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "");
    plain = plain.replace(/`([^`]+)`/g, "");
    plain = plain.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    return plain.trim();
}

/**
 * Clean heading markdown (remove # marks and IAL)
 */
export function cleanHeaderContent(md: string) {
    if (!md) return "";
    let content = md.replace(/^#+\s+/, "").trim();
    content = content.replace(/\s*\{:[^}]+\}\s*$/, "");
    return content.trim();
}
