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
    // console.log(detail);
    indexStack = new IndexStack();
    indexStack.notebookId = detail.protyle.notebookId;
    let docId = detail.blockElements[0].getAttribute("data-node-id");
    let block = detail.blockElements[0].childNodes;
    let blockElement = detail.blockElements[0];
    let initialListType = "unordered"; // Default
    if (blockElement.getAttribute('data-type') == "NodeList") {
        let listData = JSON.parse(blockElement.getAttribute('data-listdata') || '{}');
        if (listData.Typ === 1) {
            initialListType = "ordered";
        } else if (listData.Typ === 3) {
            initialListType = "task";
        }
    }
    indexStack.basePath = await getRootDoc(docId);
    let docData = await client.getBlockInfo({
        id: detail.protyle.block.rootID
    });
    // let docData = await getParentDoc(detail.protyle.block.rootID);
    indexStack.pPath = docData.data.path.slice(0, -3);
    await parseChildNodes(block,indexStack,0,initialListType);
    await stackPopAll(indexStack);

    // Generate markdown from the indexStack
    let generatedMarkdown = generateMarkdownFromIndexStack(indexStack);

    // Insert the generated markdown into the document
    if (generatedMarkdown !== '') {
        await insertDataSimple(docId, generatedMarkdown);
    } else {
        client.pushErrMsg({
            msg: i18n.errorMsg_miss,
            timeout: 3000
        });
    }
}

// New function to generate markdown from IndexStack
function generateMarkdownFromIndexStack(stack: IndexStack, indentLevel: number = 0): string {
    let markdown = "";
    let tempStack = new IndexStack();

    // Pop all items from the original stack and push to tempStack to reverse order
    while (!stack.isEmpty()) {
        tempStack.push(stack.pop());
    }

    let orderedListCounters: { [key: number]: number } = {}; // To keep track of ordered list numbers per level

    while (!tempStack.isEmpty()) {
        let item = tempStack.pop();

        let prefix = "";
        for (let i = 0; i < indentLevel; i++) {
            prefix += "    "; // 4 spaces for indentation
        }

        if (item.listType === "ordered") {
            if (!orderedListCounters[indentLevel]) {
                orderedListCounters[indentLevel] = 1;
            }
            prefix += `${orderedListCounters[indentLevel]}. `;
            orderedListCounters[indentLevel]++;
        } else if (item.listType === "task") {
            prefix += "- [ ] "; // Task list item
        } else { // unordered
            prefix += "- "; // Unordered list item
        }

        markdown += `${prefix}📄 [${item.text}](siyuan://blocks/${item.blockId})\n`;

        if (!item.children.isEmpty()) {
            markdown += generateMarkdownFromIndexStack(item.children, indentLevel + 1);
        }
    }
    return markdown;
}

async function parseChildNodes(childNodes: any, currentStack: IndexStack, tab = 0, parentListType: string) {
    tab++;
    for (const childNode of childNodes) {
        if (childNode.getAttribute('data-type') == "NodeListItem") {
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

            // Create the IndexStackNode for the current list item
            let item = new IndexStackNode(tab, itemText, parentListType);
            currentStack.push(item);

            // Recursively process sub-lists, passing the children stack of the current item
            for (const subListNode of subListNodes) {
                let subListType = "unordered"; // Default for sub-list
                let subListData = JSON.parse(subListNode.getAttribute('data-listdata') || '{}');
                if (subListData.Typ === 1) {
                    subListType = "ordered";
                } else if (subListData.Typ === 3) {
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
    let item : IndexStackNode;
    let temp = new IndexStack();
    while(!stack.isEmpty()){
        item = stack.pop();

        let text = item.text;

        // if(hasEmoji(text.slice(0,2))){
        //     text = text.slice(3);
        // }
        
        let subPath = stack.basePath+"/"+text;

        let createdBlockId = await createDoc(indexStack.notebookId, subPath);
        item.blockId = createdBlockId;
        item.documentPath = stack.pPath + "/" + createdBlockId;
        temp.push(item);
        if(!item.children.isEmpty()){
            item.children.basePath = subPath;
            item.children.pPath = item.documentPath;
            stackPopAll(item.children);
        }
    }
    temp.pPath = stack.pPath;
    // await sortDoc(temp);
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
//         {r
//             paths: paths,
//             notebook: notebook
//         }
//     );
// }