/**
 * 获取处理后的文档图标 (Unicode/Emoji/Static Text)
 * @param icon 图标字符串
 * @param hasChild 是否有子文档 (用于默认图标判断)
 * @returns 处理后的图标字符串
 */
export function getProcessedDocIcon(icon: string, hasChild: boolean) {
    if (icon == '' || icon == undefined) {
        return hasChild ? "📑" : "📄";
    }
    
    // 1. Unicode Hex Sequence (e.g. "1f600" or "1f468-200d")
    if (/^[0-9a-fA-F-]+$/.test(icon)) {
        let result = "";
        try {
            for (const element of icon.split("-")) {
                const codePoint = parseInt(element, 16);
                if (isNaN(codePoint)) {
                    return hasChild ? "📑" : "📄";
                }
                result += String.fromCodePoint(codePoint);
            }
            return result;
        } catch (e) {
            return hasChild ? "📑" : "📄";
        }
    }
    
    // 2. Direct Emoji / Short text (heuristic)
    // Avoids paths like "api/icon/..." or "image.png"
    if (icon.length <= 4 && !icon.includes("/")) {
        return icon;
    }

    // 3. Complex/Dynamic/File Icon -> Default
    return hasChild ? "📑" : "📄";
}
