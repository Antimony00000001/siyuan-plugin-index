import { insertDataSimple } from "../creater/createIndex";
import { IndexStackNode, IndexStack } from "../indexnode";
import { settings } from "../settings";
import { client, i18n } from "../utils";
import { getSubdocIcon } from "../creater/createIndex";

//目录栈
let indexStack : IndexStack;

/**
 * 块标菜单回调
 * @param detail 事件细节
 * @returns void
 */
export function buildDoc({ detail }: any) {
    console.log("buildDoc: Function called.");
    //如果选中块大于1或不是列表块或未开启按钮，则直接结束
    if (detail.blockElements.length > 1 || 
        detail.blockElements[0].getAttribute('data-type') != "NodeList" ||
        !settings.get("docBuilder")) {
        console.log("buildDoc: Initial checks failed. Returning.");
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
    console.log("parseBlockDOM: Function called.");
    indexStack = new IndexStack();
    indexStack.notebookId = detail.protyle.notebookId;
    let docId = detail.blockElements[0].getAttribute("data-node-id");
    console.log(`parseBlockDOM: Processing docId: ${docId}`);
    let block = detail.blockElements[0].childNodes;
    let blockElement = detail.blockElements[0];

    let initialListType = "unordered"; // Default
    const subType = blockElement.getAttribute('data-subtype');
    if (subType === 'o') {
        initialListType = "ordered";
    } else if (subType === 't') {
        initialListType = "task";
    }
    console.log(`parseBlockDOM: Initial list type: ${initialListType}`);
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
            const originalListItemId = childNode.getAttribute('data-node-id');
            let sChildNodes = childNode.childNodes;
            let itemText = "";
            let existingBlockId = ""; // New variable to store existing block ID
            let subListNodes = [];

            // Helper to strip icon prefixes from text
            const stripIconPrefix = (text: string) => {
                // Matches leading emojis (like 📑, 📄) or :word: patterns
                // Also matches `[<anything>](siyuan://blocks/<id>) ` pattern to catch previously generated links with icons
                const iconOrLinkRegex = /^(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|:\w+:|\[.*?\]\(siyuan:\/\/blocks\/.*?\))\s*/;
                return text.replace(iconOrLinkRegex, '').trim();
            };

            for (const sChildNode of sChildNodes) {
                if (sChildNode.getAttribute('data-type') == "NodeParagraph") {
                    const paragraphContent = sChildNode.innerHTML;
                    // Get raw content first, then strip icon/link prefixes
                    let rawItemText = window.Lute.BlockDOM2Content(paragraphContent);
                    itemText = stripIconPrefix(rawItemText);

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
            let existingIcon = "";
            let existingSubFileCount = 0;

            if (existingBlockId) {
                console.log(`parseChildNodes: Found existingBlockId: ${existingBlockId} for item: ${itemText}`);
                let blockAttrs = await client.getBlockAttrs({ id: existingBlockId });
                if (blockAttrs && blockAttrs.data) {
                    existingIcon = blockAttrs.data.icon || "";
                    console.log(`parseChildNodes: Retrieved existing icon from attrs: '${existingIcon}'`);
                }
                let blockInfo = await client.getBlockInfo({ id: existingBlockId });
                if (blockInfo && blockInfo.data) {
                    existingSubFileCount = blockInfo.data.subFileCount || 0;
                    console.log(`parseChildNodes: Retrieved existing subFileCount from info: ${existingSubFileCount}`);
                }
            }

            // Create the IndexStackNode for the current list item
            if (currentItemType === "task") {
                const taskMarkerElement = childNode.querySelector('[data-type="NodeTaskListItemMarker"]');
                if (taskMarkerElement && taskMarkerElement.getAttribute('data-task') === 'true') {
                    taskStatus = "[x]";
                } else {
                    taskStatus = "[ ]";
                }
            }
            let item = new IndexStackNode(tab, itemText, currentItemType, taskStatus, existingIcon, existingSubFileCount, existingBlockId);
            currentStack.push(item);
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
        console.log(`createDoc: Document already exists at path ${hpath}, ID: ${existingDocResponse.data[0].id}`);
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
        console.log(`createDoc: Created new document at path ${hpath}, ID: ${response.data}`);
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

        let text = item.text;

        // if(hasEmoji(text.slice(0,2))){
        //     text = text.slice(3);
        // }
        
        let subPath = stack.basePath+"/"+text;

        let currentBlockId = item.blockId; // Use existing blockId if available
        if (!currentBlockId) {
            currentBlockId = await createDoc(indexStack.notebookId, subPath);
        }
        item.blockId = currentBlockId;
        item.documentPath = stack.pPath + "/" + currentBlockId;

        // Fetch block info to get icon and subFileCount
        let blockAttrs = await client.getBlockAttrs({ id: currentBlockId });
        if (blockAttrs && blockAttrs.data) {
            item.icon = blockAttrs.data.icon || ''; // Ensure it's a string
            console.log(`stackPopAll: Fetched icon from attrs for ${item.text}: '${item.icon}'`);
        }
        let blockInfo = await client.getBlockInfo({ id: currentBlockId });
        if (blockInfo && blockInfo.data) {
            item.subFileCount = blockInfo.data.subFileCount || 0;
            console.log(`stackPopAll: Fetched subFileCount from info for ${item.text}: ${item.subFileCount}`);
        }

        // Determine the display icon. Only update if the existing icon is a default one or empty.
        const defaultDocIcon = "📄";
        const defaultFolderIcon = "📑";

        // Check if the current icon is one of the default icons or empty
        if (item.icon === '' || item.icon === defaultDocIcon || item.icon === defaultFolderIcon) {
            const displayIcon = getSubdocIcon(item.icon, item.subFileCount !== 0);
            if (displayIcon && displayIcon !== item.icon) { // Only update if different from current
                console.log(`stackPopAll: Updating icon for ${item.text} from '${item.icon}' to '${displayIcon}'`);
                await client.setBlockAttrs({
                    id: item.blockId,
                    attrs: { icon: displayIcon }
                });
                item.icon = displayIcon; // Update item.icon to reflect the change
            } else {
                console.log(`stackPopAll: No icon update needed for ${item.text}. Current: '${item.icon}', Proposed: '${displayIcon}'`);
            }
        } else {
            console.log(`stackPopAll: Preserving custom icon for ${item.text}: '${item.icon}'`);
        }

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
    console.log(`reconstructListMarkdownWithLinks: Function called for indentLevel: ${indentLevel}`);
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

                const itemText = window.Lute.BlockDOM2Content(paragraphElement.innerHTML);



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

                    let iconPrefix = `${getSubdocIcon(correspondingIndexNode.icon, correspondingIndexNode.subFileCount != undefined && correspondingIndexNode.subFileCount != 0)} `;
                    markdown += `${prefix}${iconPrefix}[${itemText}](siyuan://blocks/${correspondingIndexNode.blockId})\n`;



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
    console.log(`reconstructListMarkdownWithLinks: Generated markdown for indentLevel ${indentLevel}:\n${markdown}`);
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