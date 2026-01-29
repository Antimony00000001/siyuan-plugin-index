/**
 * 从 Markdown 中提取现有的锚文本
 * 支持单引号和双引号 ((id 'text')) 或 ((id "text"))
 */
export function extractAnchors(markdown: string): Map<string, string> {
    const anchors = new Map<string, string>();
    if (!markdown) return anchors;

    // Match ((id 'anchor')) or ((id "anchor"))
    const refRegex = /\(\(([a-zA-Z0-9-]+)\s+(?:'|")(.*?)(?:'|")\)\)/g;
    let match;
    while ((match = refRegex.exec(markdown)) !== null) {
        anchors.set(match[1], match[2]);
    }

    // Match [anchor](siyuan://blocks/id)
    const linkRegex = /\[(.*?)\]\(siyuan:\/\/blocks\/([a-zA-Z0-9-]+)\)/g;
    while ((match = linkRegex.exec(markdown)) !== null) {
        anchors.set(match[2], match[1]);
    }

    return anchors;
}

/**
 * 验证锚文本是否为有效的自定义分隔符
 * 允许短文本、Emoji、图片语法
 */
export function isValidSeparator(anchor: string): boolean {
    // 1. Short text (e.g. '?', '->', '1.', '??')
    if (anchor.length <= 6) return true;
    
    // 2. Emoji shortcodes (e.g. ':smile:', ':long_emoji_name:')
    if (anchor.startsWith(':') && anchor.endsWith(':')) return true;

    // 3. Image/Icon links (e.g. '![icon](...)')
    if (anchor.startsWith('![') && anchor.includes('](') && anchor.endsWith(')')) return true;

    // Otherwise, assume it's unwanted text (like a previous title)
    return false;
}
