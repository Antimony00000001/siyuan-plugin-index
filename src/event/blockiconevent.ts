import { insertDataSimple } from "../creater/createIndex";
import { IndexStackNode, IndexStack } from "../indexnode";
import { settings } from "../settings";
import { client, i18n } from "../utils";

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
            const originalListItemId = childNode.getAttribute('data-node-id');
            let sChildNodes = childNode.childNodes;
            let itemText = "";
            let subListNodes = [];

            for (const sChildNode of sChildNodes) {
                if (sChildNode.getAttribute('data-type') == "NodeParagraph") {
                    itemText = window.Lute.BlockDOM2Content(sChildNode.innerHTML);
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
            let item = new IndexStackNode(tab, itemText, currentItemType, taskStatus);
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



/**

 * 创建文档

 * @param notebookId 笔记本id

 * @param hpath 文档路径

 * @returns 响应内容

 */

async function createDoc(notebookId:string,hpath:string){



    let response = await client.createDocWithMd({

        markdown: "",

        notebook: notebookId,

        path: hpath

    });

    return response.data;



}



/**

 * 全部出栈

 * @param stack 目录栈

 */

async function stackPopAll(stack:IndexStack){

    // Iterate directly over the stack's internal array to update items in place

    for (const item of stack.stack) {

        let text = item.text;



        // if(hasEmoji(text.slice(0,2))){

        //     text = text.slice(3);

        // }

        

        let subPath = stack.basePath+"/"+text;



        let createdBlockId = await createDoc(indexStack.notebookId, subPath);

        item.blockId = createdBlockId;

        item.documentPath = stack.pPath + "/" + createdBlockId;



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

                    markdown += `${prefix}((${correspondingIndexNode.blockId} '${itemText}'))\n`;



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