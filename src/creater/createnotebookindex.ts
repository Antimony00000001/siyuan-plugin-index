import { Dialog } from "siyuan";
import { client, escapeHtml, i18n } from "../utils";
import NotebookDialog from "../components/dialog/notebook-dialog.svelte"
import { settings } from "../settings";
import { getDocid, getProcessedDocIcon, insertDataSimple } from "./createIndex";
// import { settings } from "./settings";
// import { eventBus } from "./enventbus";

/**
 * 创建配置模板
 * @returns void
 */
export async function onCreatenbiButton() {
    getNotebookDialog();
    // console.log("create template");

}

/**
 * 接收模板名弹窗
 */
function getNotebookDialog() {
    const settingsDialog = "index-get-notebook";

    const dialog = new Dialog({
        title: i18n.settingsTab.items.notebookDialog.dialogtitle,
        content: `<div id="${settingsDialog}" class="b3-dialog__content">`,
        width: "70%",
    });
    let div: HTMLDivElement = dialog.element.querySelector(`#${settingsDialog}`);

    new NotebookDialog({
        target: div,
        props: {
            onSave: () => { onCreate(dialog) }
        }
    });
}

/**
 * 保存模板
 * @param dialog 弹窗
 * @returns void
 */
async function onCreate(dialog: Dialog) {

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

    let el: HTMLInputElement = dialog.element.querySelector("#notebook-get");
    console.log(el.value);
    let docs = await client.listDocsByPath({
        notebook: el.value,
        path: "/"
    });
    console.log(docs);

    let data = "";

    //生成写入文本
    for (let doc of docs.data.files) {

        let id = doc.id;
        let name = doc.name.slice(0, -3);
        let icon = doc.icon;
        let subFileCount = doc.subFileCount;

        //转义
        name = escapeHtml(name);

        //应用设置
        let listType = settings.get("listTypeNotebook") == "unordered" ? true : false;
        if (listType) {
            data += "* ";
        } else {
            data += "1. ";
        }

        if (settings.get("iconNotebook")) {
            data += `${getSubdocIcon(icon, subFileCount != 0)} `;
        }

        //置入数据
        let linkType = settings.get("linkTypeNotebook") == "ref" ? true : false;
        if (linkType) {
            data += `[${name}](siyuan://blocks/${id})\n`;
        } else {
            data += `((${id} '${name}'))\n`;
        }

    }

    if (data != '') {
        await insertDataSimple(parentId, data);
    } else {
        client.pushErrMsg({
            msg: i18n.errorMsg_miss,
            timeout: 3000
        });
        return;
    }

    dialog.destroy();
    // showMessage(
    //     i18n.msg_success,
    //     3000,
    //     "info"
    // );
}