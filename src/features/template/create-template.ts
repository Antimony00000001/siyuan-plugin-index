import { Dialog, fetchSyncPost, showMessage } from "siyuan";
import { i18n } from "../../shared/utils";
import TemplateDialog from "../../ui/components/dialog/template-dialog.svelte"
import { settings } from "../../core/settings";
import { eventBus } from "../../shared/eventbus";

/**
 * 创建配置模板
 * @returns void
 */
export async function onCreateTemplateButton() {
    getNameDialog();
    // console.log("create template");

}

/**
 * 接收模板名弹窗
 */
function getNameDialog(){
    const settingsDialog = "index-get-template-name";

    const dialog = new Dialog({
        title: i18n.settingsTab.items.templateDialog.title,
        content: `<div id="${settingsDialog}" class="b3-dialog__content">`,
        width:"300px",
    });
    let div: HTMLDivElement = dialog.element.querySelector(`#${settingsDialog}`);

    new TemplateDialog({
        target: div,
        props:{
            onSave: ()=>{onSave(dialog)}
        }
    });
}

/**
 * 保存模板
 * @param dialog 弹窗
 * @returns void
 */
async function onSave(dialog:Dialog){

    let el: HTMLInputElement = dialog.element.querySelector("#template-name");
    if(el.value == ""){
        showMessage(
            i18n.templateNameEepty,
            3000,
            "error"
        );
        return;
    } else {
        let rs = await fetchSyncPost(
            "/api/file/readDir",
            {
                "path": "/data/storage/petal/siyuan-plugins-index"
            }
        );
        let data = rs.data;

        for (const iterator of data) {
            // console.log(iterator.name);
            if(iterator.name.indexOf("template-index-"+el.value) != -1){
                showMessage(
                    i18n.templateAgain,
                    3000,
                    "error"
                );
                return;
            }
        }
        await settings.saveCopy("template-index-"+el.value);
        eventBus.emit("addTemplateIndex","template-index-"+el.value);
        
    }
    // console.log("el:"+el.value);
    dialog.destroy();
    showMessage(
        i18n.templateCreated,
        3000,
        "info"
    );
}

/**
 * 加载模板
 */
export async function onGetTemplate(){
    let rs = await fetchSyncPost(
        "/api/file/readDir",
        {
            "path": "/data/storage/petal/siyuan-plugins-index"
        }
    );

    let data = rs.data;

    for (const iterator of data) {
        if(iterator.name.startsWith("template-index-")){
            await settings.load(iterator.name);
        }
    }

    // for (const key in plugin.data) {
    //     console.log(key);
    // }
    
}