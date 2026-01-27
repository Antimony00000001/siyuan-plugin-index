import { fetchSyncPost } from "siyuan";
import { plugin } from "./utils";

//配置文件名称
export const CONFIG = "config";

//配置文件内容
// export const DEFAULT_CONFIG = {
//     icon: true,
//     depth: 0,
//     listType:"unordered",
//     linkType:"ref",
//     docBuilder: false,
//     autoUpdate: true,
//     col:1,
//     fold:0,
//     at:true,
//     outlineAutoUpdate: false,
//     outlineType:"ref",
//     listTypeOutline:"unordered",
// };

/**
 * 配置类
 */
class Settings{

    //初始化配置文件
    // async initData() {
    //     //载入配置
    //     await this.load();

    //     //配置不存在则按照默认值建立配置文件
    //     if (plugin.data[CONFIG] === "" || plugin.data[CONFIG] === undefined || plugin.data[CONFIG] === null) {
    //         await plugin.saveData(CONFIG, JSON.stringify(DEFAULT_CONFIG));
    //     }
    //     await this.load();
    // }

    async initData() {
        //载入配置
        await this.load();

        //配置不存在则按照默认值建立配置文件
        if (plugin.data[CONFIG] === "" || plugin.data[CONFIG] === undefined || plugin.data[CONFIG] === null) {
            await plugin.saveData(CONFIG, JSON.stringify(new SettingsProperty()));
        }
        await this.load();
    }

    set(key:any, value:any,config = CONFIG){
        plugin.data[config][key] = value;
    }

    get(key:any,config = CONFIG){
        return plugin.data[config]?.[key];
    }

    async load(config = CONFIG){
        await plugin.loadData(config);
    }

    async save(config = CONFIG){
        await plugin.saveData(config, plugin.data[config]);
    }

    async saveCopy(config = CONFIG){
        await plugin.saveData(config, plugin.data[CONFIG]);
    }

    async saveTo(config:string){
        plugin.data[config]["builder"] = plugin.data[CONFIG]["builder"];
        await plugin.saveData(CONFIG, plugin.data[config]);
    }

    async remove(config = CONFIG){
        await plugin.removeData(config);
    }

    async rename(config:string, newname:string){
        await fetchSyncPost(
            "/api/file/renameFile",
            {
                "path": `/data/storage/petal/siyuan-plugins-index/${config}`,
                "newPath": `/data/storage/petal/siyuan-plugins-index/${newname}`
              }
        );
    }

    loadSettings(data: any){
        const def = new SettingsProperty();
        this.set("depth", data.depth ?? def.depth);
        this.set("listType", data.listType ?? def.listType);
        this.set("linkType", data.linkType ?? def.linkType);
        this.set("fold", data.fold ?? def.fold);
        this.set("col", data.col ?? def.col);
        this.set("autoUpdate", data.autoUpdate ?? def.autoUpdate);
    }

    loadSettingsforOutline(data: any){
        const def = new SettingsProperty();
        this.set("outlineType", data.outlineType ?? def.outlineType);
        this.set("outlineAutoUpdate", data.outlineAutoUpdate ?? def.outlineAutoUpdate);
        this.set("listTypeOutline", data.listTypeOutline ?? def.listTypeOutline);
    }

}

export const settings: Settings = new Settings();

export class SettingsProperty {
    depth: number;
    listType: string;
    linkType: string;
    builder: boolean;
    autoUpdate: boolean;
    col: number;
    fold: number;
    outlineAutoUpdate: boolean;
    outlineType: string;
    listTypeOutline: string;

    constructor(){
        this.depth = 0;
        this.listType = "unordered";
        this.linkType = "ref";
        this.builder = true;
        this.autoUpdate = true;
        this.col = 1;
        this.fold = 0;
        this.outlineAutoUpdate = false;
        this.outlineType = "ref";
        this.listTypeOutline = "unordered";
    }

    getAll(){
        this.depth = settings.get("depth");
        this.listType = settings.get("listType");
        this.linkType = settings.get("linkType");
        this.builder = settings.get("builder");
        this.autoUpdate = settings.get("autoUpdate");
        this.col = settings.get("col");
        this.fold = settings.get("fold");
        this.outlineAutoUpdate = settings.get("outlineAutoUpdate");
        this.outlineType = settings.get("outlineType");
        this.listTypeOutline = settings.get("listTypeOutline");
    }

}