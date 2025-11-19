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
            let existingBlockId = ""; // New variable to store existing block ID
            let subListNodes = [];
            let cleanMarkdown = "";

            for (const sChildNode of sChildNodes) {
                if (sChildNode.getAttribute('data-type') == "NodeParagraph") {
                    const paragraphId = sChildNode.getAttribute('data-node-id');
                    const paragraphContent = sChildNode.innerHTML;
                    
                    try {
                        const kramdownResponse = await client.getBlockKramdown({ id: paragraphId });
                        if (kramdownResponse?.data?.kramdown) {
                            const processedKramdown = kramdownResponse.data.kramdown
                                .replace(/\s*{:.*?}\s*/g, '') // remove all attributes like {: id="..."}
                                .replace(/\n/g, ' ') // replace newlines with space to avoid breaking link syntax
                                .trim();
                            cleanMarkdown = stripIconPrefix(processedKramdown);
                        }
                    } catch (e) {
                        console.error(`Failed to get kramdown for paragraph ${paragraphId}`, e);
                    }
                    
                    // Get raw content first, then strip icon/link prefixes
                    let rawItemText = window.Lute.BlockDOM2Content(paragraphContent);
                    itemText = stripIconPrefix(rawItemText);

                    if (!cleanMarkdown) {
                        cleanMarkdown = itemText; // Fallback to plain text
                    }

                    // Check for Siyuan block reference ((blockId 'text'))
                    let match = paragraphContent.match(/\(\((.*?)\s+\'(.*?)\'\)\)/);
                    if (match && match[1]) {
                        existingBlockId = match[1];
                    } else {
                        // Check for Markdown link [text](siyuan://blocks/blockId)
                        match = paragraphContent.match(/\[.*?\]\(siyuan:\/\/blocks\/(.*?)\)/);
                        if (match && match[1]) {
                            existingBlockId = match[1];
                        }
                    }
                } else if (sChildNode.getAttribute('data-type') == "NodeList") {
                    subListNodes.push(sChildNode);
                }
            }

            // Determine the listType for the current item (from parentListType)
            let currentItemType = parentListType;

            // Create the IndexStackNode for the current list item
            let taskStatus = "";
            if (currentItemType === "task") {
                const taskMarkerElement = childNode.querySelector('[data-type="NodeTaskListItemMarker"]');
                if (taskMarkerElement && taskMarkerElement.getAttribute('data-task') === 'true') {
                    taskStatus = "[x]";
                } else {
                    taskStatus = "[ ]";
                }
            }
            let existingSubFileCount = 0;

            if (existingBlockId) {
                let blockInfo = await client.getBlockInfo({ id: existingBlockId });
                if (blockInfo && blockInfo.data) {
                    existingSubFileCount = blockInfo.data.subFileCount || 0;
                }
            }
            let existingIcon = existingSubFileCount > 0 ? "📑" : "📄"; // Initialize with default folder/page icon

            // Create the IndexStackNode for the current list item
            if (currentItemType === "task") {
                const taskMarkerElement = childNode.querySelector('[data-type="NodeTaskListItemMarker"]');
                if (taskMarkerElement && taskMarkerElement.getAttribute('data-task') === 'true') {
                    taskStatus = "[x]";
                } else {
                    taskStatus = "[ ]";
                }
            }
            let item = new IndexStackNode(tab, itemText, currentItemType, taskStatus, existingIcon, existingSubFileCount, existingBlockId, cleanMarkdown);
            currentStack.push(item);

            // Recursively process sub-lists, passing the children stack of the current item
            for (const subListNode of subListNodes) {
                let subListType = "unordered";
                const subType = subListNode.getAttribute('data-subtype'); // Get from data-subtype
                if (subType === 'o') {
                    subListType = "ordered";
                } else if (subType === 't') {
                    subListType = "task";
                }

                await parseChildNodes(subListNode.childNodes, item.children, tab, subListType);
            }
        }
    }
}



/**

 * 获取文档块路径

 * @param id 文档块id

 * @returns 文档块路径

 */

async function getRootDoc(id:string){



    let response = await client.sql({

        stmt: `SELECT * FROM blocks WHERE id = '${id}'`

    });

    

    let result = response.data[0];

    return result?.hpath;

}



async function createDoc(notebookId:string,hpath:string){
    // 1. Check if a document with the given hpath already exists
    const escapedHpath = hpath.replace(/'/g, "''");

    let existingDocResponse = await client.sql({
        stmt: `SELECT id FROM blocks WHERE hpath = '${escapedHpath}' AND type = 'd' AND box = '${notebookId}'`
    });

    if (existingDocResponse.data && existingDocResponse.data.length > 0) {
        // Document already exists, return its ID
        return existingDocResponse.data[0].id;
    } else {
        // Add a small delay before creating a new document
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay

        // Document does not exist, create a new one
        let response = await client.createDocWithMd({
            markdown: "",
            notebook: notebookId,
            path: hpath
        });
        return response.data;
    }
}

/**
 * 全部出栈
 * @param stack 目录栈
 */
async function stackPopAll(stack:IndexStack){
    // Iterate over the stack's internal array in reverse order to update items in place
    for (let i = stack.stack.length - 1; i >= 0; i--) { // Iterate in reverse
        const item = stack.stack[i]; // Get item by index
        console.log(`[Gemini-20251024-1] stackPopAll: Processing item: ${item.text}, Block ID: ${item.blockId}`);

        let text = item.text;

        // if(hasEmoji(text.slice(0,2))){
        //     text = text.slice(3);
        // }
        
        let subPath = stack.basePath+"/"+text;

        let currentBlockId = await createDoc(indexStack.notebookId, subPath);
        item.blockId = currentBlockId;
        item.documentPath = stack.pPath + "/" + currentBlockId;

        let blockInfo = await client.getBlockInfo({ id: currentBlockId });
        console.log(`[Gemini-20251024-1] stackPopAll: blockInfo for ${item.text} (${currentBlockId}):`, blockInfo);

        // New logic: Get icon from client.listDocsByPath
        let docsInParent = await client.listDocsByPath({
            notebook: indexStack.notebookId,
            path: stack.pPath
        });

        let foundDocIcon = null;
        if (docsInParent && docsInParent.data && docsInParent.data.files) {
            const matchingDoc = docsInParent.data.files.find(doc => doc.id === currentBlockId);
            if (matchingDoc) {
                foundDocIcon = matchingDoc.icon;
            }
        }

        if (blockInfo && blockInfo.data) {
            item.subFileCount = blockInfo.data.subFileCount || 0;
            // Prioritize the icon found from listDocsByPath, fallback to default based on subFileCount
            item.icon = foundDocIcon || (item.subFileCount > 0 ? "📑" : "📄");
        }
        console.log(`[Gemini-20251024-1] stackPopAll: Initial item.icon for ${item.text}: '${item.icon}'`);

        if(!item.children.isEmpty()){
            item.children.basePath = subPath;
            item.children.pPath = item.documentPath;
            await stackPopAll(item.children); // Await recursive calls
        }
    }
}



/**

 * Reconstructs the markdown for the original list with embedded links.

 * @param originalListElement The original NodeList DOM element.

 * @param currentStack The IndexStack for the current level.

 * @param indentLevel The current indentation level.

 * @returns The reconstructed markdown string.

 */

async function reconstructListMarkdownWithLinks(originalListElement: HTMLElement, currentStack: IndexStack, indentLevel: number = 0, orderedListCounters: { [key: number]: number } = {}): Promise<string> {
    console.log(`[Gemini-20251024-1] reconstructListMarkdownWithLinks: Function called for indentLevel: ${indentLevel}`);
    let markdown = "";

    const originalListItems = originalListElement.children;

    let stackIndex = 0;



    // Initialize counter for this level if it's an ordered list

    if (currentStack.stack.length > 0 && currentStack.stack[0].listType === "ordered" && !orderedListCounters[indentLevel]) {

        orderedListCounters[indentLevel] = 1;

    }



    for (const originalListItem of Array.from(originalListItems)) {

        if (originalListItem instanceof HTMLElement && originalListItem.getAttribute('data-type') === "NodeListItem") {

            const paragraphElement = originalListItem.querySelector('[data-type="NodeParagraph"]');

            if (paragraphElement) {

                let itemText = window.Lute.BlockDOM2Content(paragraphElement.innerHTML);
                itemText = stripIconPrefix(itemText); // Apply the same stripping as in parseChildNodes



                const correspondingIndexNode = currentStack.stack[stackIndex];



                if (correspondingIndexNode && correspondingIndexNode.text === itemText && correspondingIndexNode.blockId) {

                    let prefix = "";

                    for (let i = 0; i < indentLevel; i++) {

                        prefix += "    "; // 4 spaces for indentation

                    }



                    if (correspondingIndexNode.listType === "ordered") {

                        prefix += `${orderedListCounters[indentLevel]}. `;

                        orderedListCounters[indentLevel]++;

                    } else if (correspondingIndexNode.listType === "task") {

                        // Use the stored taskStatus

                        prefix += `- ${correspondingIndexNode.taskStatus} `;

                    } else { // unordered

                        prefix += "- ";

                    }
                    console.log(`[Gemini-20251024-1] reconstructListMarkdownWithLinks: correspondingIndexNode.icon for ${itemText}: '${correspondingIndexNode.icon}'`);
                    const gdcIconInput = correspondingIndexNode.icon;
                    const gdcHasChildInput = correspondingIndexNode.subFileCount != undefined && correspondingIndexNode.subFileCount != 0;
                    console.log(`[Gemini-20251024-1] reconstructListMarkdownWithLinks: Calling getSubdocIcon with input: icon='${gdcIconInput}', hasChild=${gdcHasChildInput}`);
                                        let iconPrefix = `${getProcessedDocIcon(gdcIconInput, gdcHasChildInput)} `;
                                        console.log(`[Gemini-20251024-1] reconstructListMarkdownWithLinks: getSubdocIcon result for ${itemText}: '${iconPrefix.trim()}'`);
                                        markdown += `${prefix}[${iconPrefix.trim()} ${correspondingIndexNode.originalMarkdown}](siyuan://blocks/${correspondingIndexNode.blockId})\n`;
                    
                                        const nestedListElement = originalListItem.querySelector('[data-type="NodeList"]');
                    
                                        if (nestedListElement instanceof HTMLElement && !correspondingIndexNode.children.isEmpty()) {
                    
                                            // Pass a copy of orderedListCounters to the recursive call
                                            markdown += await reconstructListMarkdownWithLinks(nestedListElement, correspondingIndexNode.children, indentLevel + 1, { ...orderedListCounters });
                    
                                        }

                }

            }

            stackIndex++;

        }

    }
    console.log(`[Gemini-20251024-1] reconstructListMarkdownWithLinks: Generated markdown for indentLevel ${indentLevel}:\n${markdown}`);
    return markdown;

}





// /**

//  * 文档排序

//  * @param item 文档id栈

//  */

// async function sortDoc(item : IndexStack){

//     //构建真实顺序

//     let paths = [];

//     while(!item.isEmpty()){

//         paths.push(item.pop().path+".sy");

//     }

//     await requestChangeSort(paths,indexStack.notebookId);

// }



// /**

//  * 排序请求

//  * @param paths 路径顺序

//  * @param notebook 笔记本id

//  */

// async function requestChangeSort(paths:any[],notebook:string){

//     await fetchSyncPost(

//         "/api/filetree/changeSort",

//         {

//             paths: paths,

//             notebook: notebook

//         }

//     );

// }