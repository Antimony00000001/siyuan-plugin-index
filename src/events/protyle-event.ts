import { autoUpdateIndex } from "../features/index/action";
import { autoUpdateOutline } from "../features/outline/action";
import { isMobile } from "../shared/utils";
// import { settings } from "./settings";

/**
 * 文档加载完成事件回调
 * @param param0 事件细节
 * @returns void
 */
export function updateIndex({ detail }: any) {
    // console.log(detail);
    // console.log(detail.protyle.element.className);
    //如果不为手机端且为聚焦状态，就直接返回，否则查询更新
    if (!isMobile) {
        if(
            //为搜索界面
            detail.protyle.element.className.indexOf("search") != -1 ||
            // 为浮窗
            // detail.model == undefined || 
            detail.protyle.block.showAll){
            // || !settings.get("autoUpdate")
            return;
        }
    }
    // console.log(detail);
    // 获取笔记本id
    let notebookId = detail.protyle.notebookId;
    // 获取文档块路径
    let path = detail.protyle.path;
    // 获取文档块id
    let parentId = detail.protyle.block.rootID;
    // 自动插入
    autoUpdateIndex(notebookId,path,parentId);
    autoUpdateOutline(parentId);
}