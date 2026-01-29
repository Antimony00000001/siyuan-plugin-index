import { Plugin } from "siyuan";
import { setI18n, setPlugin } from "./utils";
import { setI18n as setNewI18n, setPlugin as setNewPlugin } from "../src/shared/utils/index";
import { createDialog, initTopbar } from "./topbar";
import { settings } from "./settings";
import { buildDoc as buildDocNew } from "../src/features/doc-builder/menu";
import { updateIndex } from "./event/protyleevent";
import { initEmojiEvent, removeEmojiEvent } from "./event/emojievent";
import { addSlash } from "./slash";

export default class IndexPlugin extends Plugin {

    //加载插件
    async onload() {
        console.log("IndexPlugin onload v1.7.1-Refactor");
        this.init();
        await initTopbar();
        // await this.initSettings();
        await settings.initData();
        //监听块菜单事件
        this.eventBus.on("click-blockicon", buildDocNew);
        //监听文档载入事件
        this.eventBus.on("loaded-protyle-static", updateIndex);
        // this.eventBus.on("ws-main",this.eventBusLog);
        initEmojiEvent();
    }
    // onLayoutReady() {
    //     initObserver();
    // }

    onunload() {
        this.eventBus.off("click-blockicon", buildDocNew);
        this.eventBus.off("loaded-protyle-static", updateIndex);
        removeEmojiEvent();
        console.log("IndexPlugin onunload");
    }

    //获取i18n和插件类实例
    init(){
        setI18n(this.i18n);
        setPlugin(this);
        setNewI18n(this.i18n);
        setNewPlugin(this);
        addSlash();
        // console.log(this.getOpenedTab());
    }

    //输出事件detail
    // private eventBusLog({detail}: any) {
    //     console.log(detail);
    // }
    async openSetting(){
        await createDialog();
    }

}