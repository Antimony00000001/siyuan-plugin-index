import { getFrontend } from "siyuan";
// We might not import the Plugin class here to avoid circular dependency if possible, 
// but for now we follow the pattern. 
// However, newsrc structure suggests we should define types in core or shared.
// I'll skip importing IndexPlugin for the type definition to keep it generic for now, 
// or use 'any' until we migrate the main class.

/**
 * 延迟函数
 * @param time 时间 (ms)
 */
export function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

// i18n 全局实例
export let i18n: any;
export function setI18n(_i18n: any) {
    i18n = _i18n;
}

// 插件全局对象
export let plugin: any; // Type as any for now to avoid dependency on legacy code
export function setPlugin(_plugin: any) {
    plugin = _plugin;
}

/**
 * 替换字符串中的导致异常的字符
 */
export function escapeHtml(unsafe: string) {
    return unsafe.replaceAll('[', '\\\[')
        .replaceAll(']', '\\\]')
        .replaceAll('&#39;', '&apos;')
        .replaceAll('\\', '&#92;')
        .replaceAll('"', '&quot;'); // Added double quote escaping as per recent fixes
}

// 运行环境检测
const frontEnd = getFrontend();
export const isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

/**
 * 获取当前文档 ID (DOM 操作)
 */
export function getDocid() {
    if (isMobile)
        return document.querySelector('#editor .protyle-content .protyle-background')?.getAttribute("data-node-id");
    else
        return document.querySelector('.layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background')?.getAttribute("data-node-id");
}
