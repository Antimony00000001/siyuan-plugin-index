import { insertDataSimple } from "../creater/createIndex";
import { IndexStackNode, IndexStack } from "../indexnode";
import { settings } from "../settings";
import { client, i18n } from "../utils";
import { getProcessedDocIcon } from "../creater/createIndex";

// Helper to strip icon prefixes from text
const stripIconPrefix = (text: string) => {
    // Matches leading emojis (like 📑, 📄) or :word: patterns
    // Also matches `[<anything>](siyuan://blocks/<id>) ` pattern to catch previously generated links with icons
    const iconOrLinkRegex = /^(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|:\w+:|\[.*?\]\(siyuan:\/\/blocks\/.*?\))\s*/;
    return text.replace(iconOrLinkRegex, '').trim();
};

//目录栈
let indexStack : IndexStack;

/**
 * 块标菜单回调
 * @param detail 事件细节
 * @returns void
 */
export function buildDoc({ detail }: any) {
    //如果选中块大于1或不是列表块或未开启按钮，则直接结束
    if (detail.blockElements.length > 1 || 
        detail.blockElements[0].getAttribute('data-type') != "NodeList" ||
        !settings.get("docBuilder")) {
        return;
    }
    //插入按钮到块菜单
    detail.menu.addItem({
        icon: "iconList",
        label: i18n.settingsTab.items.docBuilder.title,
        click: async () => {
            await parseBlockDOM(detail);
        }
    });
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
    indexStack.basePath = await getRootDoc(docId);
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

                            const finalizedMatch = kramdown.match(/^\[(.*?)\]\(siyuan:\/\/blocks\/([a-zA-Z0-9-]+)\)\s*--\s*(.*)$/s);

                            if (finalizedMatch) { // Run 2+ with the "ICON -- CONTENT" format
                                existingBlockId = finalizedMatch[2]; // The generated page ID
                                cleanMarkdown = finalizedMatch[3].trim();   // The original content part
                                itemText = window.Lute.BlockDOM2Content(paragraphContent).replace(/^.*?--\s*/, "").trim();
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
                let itemText = window.Lute.BlockDOM2Content(paragraphElement.innerHTML);
                itemText = stripIconPrefix(itemText);
                const correspondingIndexNode = currentStack.stack[stackIndex];

                if (correspondingIndexNode && correspondingIndexNode.text === itemText.replace(/!\[\]\([^)]*\)/g, '').trim() && correspondingIndexNode.blockId) {
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

                    markdown += `${prefix}[${iconPrefix.trim()}](siyuan://blocks/${node.blockId}) -- ${node.originalMarkdown}\n`;
                    
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