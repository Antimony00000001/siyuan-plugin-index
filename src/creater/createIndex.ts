// import { Dialog } from 'siyuan';
import { client, escapeHtml, i18n, isMobile, plugin } from '../utils';
import { CONFIG, settings } from '../settings';
import { IndexQueue, IndexQueueNode } from '../indexnode';
import { onCreatenbiButton } from './createnotebookindex';

let indexQueue: IndexQueue;

/**
 * 左键点击topbar按钮插入目录
 * @param targetBlockId - Optional: The ID of the block to replace (e.g., from a slash command)
 * @returns void
 */
export async function insert(targetBlockId?: string) {
    //载入配置
    await settings.load();

    //寻找当前编辑的文档的id
    let parentId = getDocid();
    if (parentId == null) {
        client.pushErrMsg({
            msg: i18n.errorMsg_empty,
            timeout: 3000
        });
        return;
    }

    //获取文档数据
    let block = await client.getBlockInfo({
        id: parentId
    });

    //插入目录
    let data = '';
    indexQueue = new IndexQueue();
    await createIndex(block.data.box, block.data.path, indexQueue);
    data = queuePopAll(indexQueue, data);
    console.log(data);
    if (data != '') {
        await insertData(parentId, data, "index", targetBlockId);
    } else {
        client.pushErrMsg({
            msg: i18n.errorMsg_miss,
            timeout: 3000
        });
    }
}

/**
 * 点击插入带大纲的目录
 * @returns void
 */
// export async function insertButton(dialog?: Dialog) {
export async function insertButton() {
    //载入配置
    await settings.load();

//    settings.set("autoUpdate", false);

    //寻找当前编辑的文档的id
    let parentId = getDocid();
    if (parentId == null) {
        client.pushErrMsg({
            msg: i18n.errorMsg_empty,
            timeout: 3000
        });
        return;
    }

    //获取文档数据
    let block = await client.getBlockInfo({
        id: parentId
    });

    //插入目录
    let data = '';
    indexQueue = new IndexQueue();
    await createIndexandOutline(block.data.box, block.data.path, indexQueue);
    data = queuePopAll(indexQueue, data);
    console.log(data);
    if (data != '') {
        await insertDataSimple(parentId, data);
    } else {
        client.pushErrMsg({
            msg: i18n.errorMsg_miss,
            timeout: 3000
        });
        return;
    }
    // dialog.destroy();
}

/**
 * 点击插入大纲
 * @param targetBlockId - Optional: The ID of the block to replace (e.g., from a slash command)
 * @returns void
 */
export async function insertDocButton(targetBlockId?: string) {
    //载入配置
    await settings.load();

    //寻找当前编辑的文档的id
    let parentId = getDocid();
    if (parentId == null) {
        client.pushErrMsg({
            msg: i18n.errorMsg_empty,
            timeout: 3000
        });
        return;
    }

    //插入目录
    let data = '';

    let outlineData = await requestGetDocOutline(parentId);
    // console.log(outlineData);
    let ids = collectOutlineIds(outlineData);
    let extraData = await getBlocksData(ids);
    data = insertOutline(data, outlineData, 0, 0, extraData);
    if (data != '') {
        await insertData(parentId, data, "outline", targetBlockId);
    } else {
        client.pushErrMsg({
            msg: i18n.errorMsg_miss_outline,
            timeout: 3000
        });
        return;
    }
}

//todo
/**
 * 点击插入笔记本目录
 * @returns void
 */
export async function insertNotebookButton() {
    //载入配置
    await settings.load();

    onCreatenbiButton();

}

/**
 * 文档构建器构建后插入目录
 * @param notebookId 笔记本id
 * @param parentId 目录块id
 * @param path 目录块path
 */
export async function insertAfter(notebookId: string, parentId: string, path: string) {
    //载入配置
    await settings.load();

    //插入目录
    let data = '';
    indexQueue = new IndexQueue();
    await createIndex(notebookId, path, indexQueue);
    data = queuePopAll(indexQueue, data);
    if (data != '') {
        await insertDataAfter(parentId, data, "index");
    } else{
        client.pushErrMsg({
            msg: i18n.errorMsg_miss,
            timeout: 3000
        });
    }
}

/**
 * 自动更新目录
 * @param notebookId 笔记本id 
 * @param path 目标文档路径
 * @param parentId 目标文档id
 */
export async function insertAuto(notebookId: string, path: string, parentId: string) {

    //载入配置
    await settings.load();

    let rs = await client.sql({
        stmt: `SELECT * FROM blocks WHERE root_id = '${parentId}' AND ial like '%custom-index-create%' order by updated desc limit 1`
    })

    // console.log(path);
    if (rs.data[0]?.id != undefined) {
        let ial = await client.getBlockAttrs({
            id: rs.data[0].id
        });

        //载入配置
        let str = ial.data["custom-index-create"];
        if (str) { // Only parse if str is not undefined or null
            try {
                settings.loadSettings(JSON.parse(str));
            } catch (e) {
                console.error("Error parsing custom-index-create settings:", e);
                // Optionally, push an error message to the user
                client.pushErrMsg({
                    msg: i18n.errorMsg_settingsParseError,
                    timeout: 3000
                });
                return; // Stop execution if settings are invalid
            }
        } else {
            // If no custom settings, use defaults or handle as appropriate
            console.log("No custom-index-create settings found, using defaults.");
        }
        if (!settings.get("autoUpdate")) {
            return;
        }
        //插入目录
        let data = '';
        indexQueue = new IndexQueue();
        await createIndex(notebookId, path, indexQueue);
        data = queuePopAll(indexQueue, data);
        // console.log(plugin.data);
        // console.log("data=" + data);
        if (data != '') {
            await insertDataAfter(rs.data[0].id, data, "index");
        } else {
            client.pushErrMsg({
                msg: i18n.errorMsg_miss,
                timeout: 3000
            });
        }
    }

}

/**
 * 自动更新大纲
 * @param notebookId 笔记本id 
 * @param path 目标文档路径
 * @param parentId 目标文档id
 */
export async function insertOutlineAuto(parentId: string) {

    //载入配置
    await settings.load();

    let rs = await client.sql({
        stmt: `SELECT * FROM blocks WHERE root_id = '${parentId}' AND ial like '%custom-outline-create%' order by updated desc limit 1`
    })


    // console.log(path);

    if (rs.data[0]?.id != undefined) {
        let ial = await client.getBlockAttrs({
            id: rs.data[0].id
        });
        //载入配置
        let str = ial.data["custom-outline-create"];
        console.log("[IndexPlugin] AutoUpdate - Raw IAL String:", str);
        
        try {
            let parsedSettings = JSON.parse(str);
            console.log("[IndexPlugin] AutoUpdate - Parsed Settings:", parsedSettings);
            settings.loadSettingsforOutline(parsedSettings);
            console.log("[IndexPlugin] AutoUpdate - Applied 'outlineType':", settings.get("outlineType"));
        } catch (e) {
            console.error("[IndexPlugin] AutoUpdate - Failed to parse settings:", e);
        }

        if (!settings.get("outlineAutoUpdate")) {
            console.log("[IndexPlugin] AutoUpdate - Aborted: outlineAutoUpdate is false");
            return;
        }
        //插入目录
        let data = '';
        let outlineData = await requestGetDocOutline(parentId);
        let ids = collectOutlineIds(outlineData);
        let extraData = await getBlocksData(ids);
        data = insertOutline(data, outlineData, 0, 0, extraData);
        // console.log(plugin.data);
        // console.log("data=" + data);
        if (data != '') {
            await insertDataAfter(rs.data[0].id, data, "outline");
        } else {
            client.pushErrMsg({
                msg: i18n.errorMsg_miss,
                timeout: 3000
            });
        }

    }

}

//获取当前文档id
export function getDocid() {
    if (isMobile)
        return document.querySelector('#editor .protyle-content .protyle-background')?.getAttribute("data-node-id");
    else
        return document.querySelector('.layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background')?.getAttribute("data-node-id");
}

async function requestGetDocOutline(blockId: string) {
    let response = await client.getDocOutline({
        id: blockId
    });
    let result = response.data;
    if (result == null) return [];
    return result;
}

function collectOutlineIds(outlineData: any[], ids: string[] = []) {
    for (const item of outlineData) {
        ids.push(item.id);
        if (item.blocks) collectOutlineIds(item.blocks, ids);
        if (item.children) collectOutlineIds(item.children, ids);
    }
    return ids;
}

async function getBlocksData(ids: string[]) {
    if (ids.length === 0) return {};
    // Split IDs into chunks to avoid too long SQL statements (SiYuan/SQLite limit)
    const chunkSize = 100;
    const result: Record<string, { ial: string, markdown: string }> = {};
    
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const idList = chunk.map(id => `'${id}'`).join(',');
        const response = await client.sql({
            stmt: `SELECT id, ial, markdown FROM blocks WHERE id IN (${idList})`
        });
        if (response.data) {
            for (const row of response.data) {
                result[row.id] = { ial: row.ial, markdown: row.markdown };
            }
        }
    }
    return result;
}

function filterIAL(ialStr: string) {
    if (!ialStr) return "";
    const ignoreAttrs = new Set(["id", "updated", "created", "hash", "box", "path", "hpath", "parent_id", "root_id", "type", "subtype", "sort", "custom-index-subdoc-id", "custom-index-heading-id", "title-img", "icon", "class", "refcount"]);
    
    // Match key="value" pairs, handling escaped quotes
    const parts = ialStr.match(/(\S+?)="([\s\S]*?)"/g);
    if (!parts) return "";
    
    const filtered = parts.filter(part => {
        const key = part.match(/^(\S+?)=/)?.[1];
        return key && !ignoreAttrs.has(key);
    });
    
    return filtered.join(" ");
}

function extractHeadingContent(markdown: string) {
    if (!markdown) return "";
    // Remove heading marks
    let content = markdown.replace(/^#+\s+/, "").trim();
    // Remove IAL at the end
    content = content.replace(/\s*\{:[^}]+\}\s*$/, "").trim();
    return content;
}

// Clean and escape content for outline
function cleanAndEscape(content: string, forRef: boolean) {
    // Remove block refs ((id "text")) or ((id 'text'))
    let clean = content.replace(/\(\([0-9a-z-]+\s+['"](.*?)['"]\)\)/g, "$1");
    // Remove links [text](url) -> text
    clean = clean.replace(/\[(.*?)\]\(.*?\)/g, "$1");
    
    if (forRef) {
        // ((id 'content')) - escape single quotes
        return clean.replace(/'/g, "&apos;");
    } else {
        // [content](url) - escape brackets
        return clean.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
    }
}

function insertOutline(data: string, outlineData: any[], tab: number, stab: number, extraData?: Record<string, { ial: string, markdown: string }>) {

    tab++;

    //生成写入文本
    // console.log("outlineData.length:" + outlineData.length)
    for (let outline of outlineData) {
        let id = outline.id;
        let name = "";
        let ial = "";

        if (extraData && extraData[id]) {
            name = extractHeadingContent(extraData[id].markdown) || (outline.depth == 0 ? outline.name : outline.content);
            ial = filterIAL(extraData[id].ial);
        } else {
            if (outline.depth == 0) {
                name = outline.name;
            } else {
                name = outline.content;
            }
        }

        // Add debug log
        console.log("insertOutline debug:", { name, id, depth: outline.depth });

        let indent = "";
        // let icon = doc.icon;
        let subOutlineCount = outline.count;
        for (let n = 1; n <= stab; n++) {
            indent += '    ';
        }

        indent += "> ";

        for (let n = 1; n < tab - stab; n++) {
            indent += '    ';
        }

        // Removed global escapeHtml(name)

        //应用设置
        let listType = settings.get("listTypeOutline") == "unordered" ? true : false;
        let listMarker = "";
        if (listType) {
            listMarker = "* ";
        } else {
            listMarker = "1. ";
        }

        data += indent + listMarker;

        //置入数据
        let outlineType = settings.get("outlineType") == "copy" ? true : false;
        let ialStr = ial ? `\n${indent}   {: ${ial}}` : "";

        if(outlineType){
            // Copy mode: keep formatting, maybe just escape severe breakers if needed?
            // For now, using raw name as it was likely intended to show formatted text.
            data += `${name}((${id} '*'))${ialStr}\n`;
        } else {
            outlineType = settings.get("outlineType") == "ref" ? true : false;
            let anchorText = "➖";
            if (outlineType) {
                // Link mode: [name](siyuan://blocks/id)
                // Replicate ListBlockPlugin: [Anchor](Link) Text
                data += `[${anchorText}](siyuan://blocks/${id}) ${name}${ialStr}\n`;
            } else {
                // Block Ref mode: ((id 'name'))
                // Replicate ListBlockPlugin: ((Ref)) Text
                data += `((${id} '${anchorText}')) ${name}${ialStr}\n`;
            }
        }
        
        //`((id "锚文本"))`
        if (subOutlineCount > 0) {//获取下一层级子文档
            if (outline.depth == 0) {
                data = insertOutline(data, outline.blocks, tab, stab, extraData);
            } else {
                data = insertOutline(data, outline.children, tab, stab, extraData);
            }
        }

    }
    return data;
}



//获取图标
export function getProcessedDocIcon(icon: string, hasChild: boolean) {
    if (icon == '' || icon == undefined) {
        return hasChild ? "📑" : "📄";
    } else if (icon.indexOf(".") != -1) {
        if (icon.indexOf("http://") != -1 || icon.indexOf("https://") != -1) {
            return hasChild ? "📑" : "📄";
        } else {
            // 移除扩展名
            let removeFileFormat = icon.substring(0, icon.lastIndexOf("."));
            return `:${removeFileFormat}:`;
        }
    } else if (icon.includes("api/icon/getDynamicIcon")) {
        return `![](${icon})`;
    } else {
        // If it's not a hex string, and not a URL, and not a file extension, assume it's a direct emoji.
        // This is a heuristic, as a robust emoji check is complex.
        if (!/^[0-9a-fA-F-]+$/.test(icon) && !icon.includes("http://") && !icon.includes("https://") && icon.length <= 4) { 
             console.log(`[Gemini-20251024-1] getProcessedDocIcon: Assuming direct emoji: '${icon}'`);
             return icon;
        }

        let result = "";
        for (const element of icon.split("-")) {
            const codePoint = parseInt(element, 16);
            if (isNaN(codePoint)) {
                // If any part is not a valid hex, return default icons
                console.log(`[Gemini-20251024-1] getProcessedDocIcon: parseInt failed for element '${element}', returning default.`);
                return hasChild ? "📑" : "📄";
            }
            result += String.fromCodePoint(codePoint);
        }
        console.log(`[Gemini-20251024-1] getProcessedDocIcon: For icon '${icon}', final result: '${result}'`);
        return result;
    }
}

//创建目录
async function createIndexandOutline(notebook: any, ppath: any, pitem: IndexQueue, tab = 0) {

    if (settings.get("depth") == 0 || settings.get("depth") > tab) {

        let docs;
        try {
            docs = await client.listDocsByPath({
                notebook: notebook,
                path: ppath
            });
        } catch (err) {
            console.error(`Failed to list docs for path "${ppath}":`, err);
            return; // Stop processing this branch if listing docs fails
        }

        if (!docs?.data?.files?.length) {
            return; // No sub-documents, which is valid, so just return.
        }
        
        tab++;

        //生成写入文本
        for (let doc of docs.data.files) {
            try {
                let data = "";
                let id = doc.id;
                let name = doc.name.slice(0, -3);
                let icon = doc.icon;
                let subFileCount = doc.subFileCount;
                let path = doc.path;
                for (let n = 1; n < tab; n++) {
                    data += '    ';
                }

                //转义
                name = escapeHtml(name);

                //应用设置
                let listType = settings.get("listType") == "unordered" ? true : false;
                if (listType) {
                    data += "* ";
                } else {
                    data += "1. ";
                }

                let iconStr = getProcessedDocIcon(icon, subFileCount != 0);

                //置入数据
                let linkType = settings.get("linkType") == "ref" ? true : false;
                if (linkType) {
                    data += `[${iconStr}](siyuan://blocks/${id}) ${name}\n`;
                } else {
                    let safeIconStr = iconStr.replace(/'/g, "&apos;");
                    data += `((${id} '${safeIconStr}')) ${name}\n`;
                }
                
                let outlineData = await requestGetDocOutline(id);
                let outlineIds = collectOutlineIds(outlineData);
                let extraData = await getBlocksData(outlineIds);
                data = insertOutline(data, outlineData, tab, tab, extraData);

                let item = new IndexQueueNode(tab, data);
                pitem.push(item);
                //`((id "锚文本"))`
                if (subFileCount > 0) {//获取下一层级子文档
                    await createIndexandOutline(notebook, path, item.children, tab);
                }
            } catch (err) {
                console.error(`Failed to process document "${doc.id}" in createIndexandOutline:`, err);
                // Continue to the next document
            }
        }
    }
}

/**
 * 创建目录
 * @param notebook 笔记本id
 * @param ppath 父文档路径
 * @param data 数据
 * @param tab 深度
 * @returns 待插入数据
 */
async function createIndex(notebook: any, ppath: any, pitem: IndexQueue, tab = 0) {

    if (settings.get("depth") == 0 || settings.get("depth") > tab) {

        let docs = await client.listDocsByPath({
            notebook: notebook,
            path: ppath
        });
        tab++;

        //生成写入文本
        for (let doc of docs.data.files) {

            let data = "";
            let id = doc.id;
            let name = doc.name.slice(0, -3);
            let icon = doc.icon;
            let subFileCount = doc.subFileCount;
            let path = doc.path;
            for (let n = 1; n < tab; n++) {
                data += '    ';
            }

            //转义
            name = escapeHtml(name);

            //应用设置
            let listType = settings.get("listType") == "unordered" ? true : false;
            if (listType) {
                data += "* ";
            } else {
                data += "1. ";
            }

            // if(settings.get("fold") == tab){
            //     data += '{: fold="1"}';
            // }

            let iconStr = getProcessedDocIcon(icon, subFileCount != 0);

            //置入数据
            let linkType = settings.get("linkType") == "ref" ? true : false;
            if (linkType) {
                data += `[${iconStr}](siyuan://blocks/${id}) ${name}\n`;
            } else {
                let safeIconStr = iconStr.replace(/'/g, "&apos;");
                data += `((${id} '${safeIconStr}')) ${name}\n`;
            }
            // console.log(data);
            let item = new IndexQueueNode(tab, data);
            pitem.push(item);
            if (subFileCount > 0) {//获取下一层级子文档
                await createIndex(notebook, path, item.children, tab);
            }

        }
    }
}


//插入数据
export async function insertDataSimple(id: string, data: string) {

    await client.insertBlock({
        data: data,
        dataType: 'markdown',
        parentID: id
    });

    client.pushMsg({
        msg: i18n.msg_success,
        timeout: 3000
    });

}

//插入数据
async function insertData(id: string, data: string, type: string, targetBlockId?: string) {
    console.log("[IndexPlugin] insertData called with:", { id, type, targetBlockId });

    let attrs : any;

    if(type == "index"){
        attrs = {
            "custom-index-create": JSON.stringify(plugin.data[CONFIG])
        };
    } else if(type == "outline"){
        attrs = {
            "custom-outline-create": JSON.stringify(plugin.data[CONFIG])
        };
    }

    try {
        let rs = await client.sql({
            stmt: `SELECT * FROM blocks WHERE root_id = '${id}' AND ial like '%custom-${type}-create%' order by updated desc limit 1`
        });
        console.log("[IndexPlugin] Existing block check:", rs.data[0]);

        if (rs.data[0]?.id == undefined) {
            // No existing index/outline found
            if (targetBlockId) {
                console.log("[IndexPlugin] Updating target block (Slash command):", targetBlockId);
                // Slash command: Replace the slash command block with new content
                let result = await client.updateBlock({
                    data: data,
                    dataType: 'markdown',
                    id: targetBlockId
                });
                await client.setBlockAttrs({
                    attrs: attrs,
                    id: result.data[0].doOperations[0].id
                });
                client.pushMsg({
                    msg: i18n.msg_success,
                    timeout: 3000
                });
            } else {
                console.log("[IndexPlugin] Inserting new block (Button)");
                // Topbar button: Append new block
                let result = await client.insertBlock({
                    data: data,
                    dataType: 'markdown',
                    parentID: id
                });
                await client.setBlockAttrs({
                    attrs: attrs,
                    id: result.data[0].doOperations[0].id
                });
                client.pushMsg({
                    msg: i18n.msg_success,
                    timeout: 3000
                });
            }
        } else {
            console.log("[IndexPlugin] Updating existing block:", rs.data[0].id);
            // Existing index/outline found
            let result = await client.updateBlock({
                data: data,
                dataType: 'markdown',
                id: rs.data[0].id
            });
            await client.setBlockAttrs({
                attrs: attrs,
                id: result.data[0].doOperations[0].id
            });
            
            // If invoked via slash command, delete the slash command block since we updated the existing one
            if (targetBlockId) {
                console.log("[IndexPlugin] Deleting target block (duplicate/cleanup):", targetBlockId);
                await client.deleteBlock({
                    id: targetBlockId
                });
            }

            client.pushMsg({
                msg: i18n.update_success,
                timeout: 3000
            });
        }
    } catch (error) {
        console.error("[IndexPlugin] insertData error:", error);
        client.pushErrMsg({
            msg: i18n.dclike,
            timeout: 3000
        });
    }


}

//插入数据
async function insertDataAfter(id: string, data: string, type: string) {

    let attrs : any;

    if(type == "index"){
        attrs = {
            "custom-index-create": JSON.stringify(plugin.data[CONFIG])
        };
    } else if(type == "outline"){
        attrs = {
            "custom-outline-create": JSON.stringify(plugin.data[CONFIG])
        };
    }

    let result = await client.updateBlock({
        data: data,
        dataType: "markdown",
        id: id
    });

    await client.setBlockAttrs({
        id: result.data[0].doOperations[0].id,
        attrs: attrs
    });

}

function queuePopAll(queue: IndexQueue, data: string) {

    if (queue.getFront()?.depth == undefined) {
        return "";
    }

    let item: IndexQueueNode;

    let num = 0;
    let temp = 0;
    let times = 0;
    let depth = queue.getFront().depth;
    if (depth == 1 && settings.get("col") != 1) {
        data += "{{{col\n";
        temp = Math.trunc(queue.getSize() / settings.get("col"));
        times = settings.get("col") - 1;
    }

    while (!queue.isEmpty()) {
        num++;
        item = queue.pop();

        //有子层级时才折叠
        if (!item.children.isEmpty() &&  settings.get("fold")!=0 &&settings.get("fold") <= item.depth ) {
            let n = 0;
            let listType = settings.get("listType") == "unordered" ? true : false;
            if (listType) {
                n = item.text.indexOf("*");
                item.text = item.text.substring(0, n + 2) + '{: fold="1"}' + item.text.substring(n + 2);
            } else {
                n = item.text.indexOf("1");
                item.text = item.text.substring(0, n + 3) + '{: fold="1"}' + item.text.substring(n + 3);
            }
        }
        data += item.text;
        // console.log("queuePopAll", item.text);

        if (!item.children.isEmpty()) {
            data = queuePopAll(item.children, data);
        }
        if (item.depth == 1 && num == temp && times > 0) {
            data += `\n{: id}\n`;
            num = 0;
            times--;
        }
    }
    if (depth == 1 && settings.get("col") != 1) {
        data += "}}}";
    }
    return data;
}