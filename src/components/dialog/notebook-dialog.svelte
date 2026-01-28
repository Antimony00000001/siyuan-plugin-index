<script lang="ts">
    import { onMount } from "svelte";
    import { client, i18n } from "../../utils";
    import SettingItem from "../setting-item.svelte";
    import { settings } from "../../settings";

    export let onSave = function () {};

    let notebooks = [];
    let toNotebookId: any;
    // let toNotebookName: any;

    // 用户指南不应该作为可以写入的笔记本
    const hiddenNotebook: Set<string> = new Set([
        "思源笔记用户指南",
        "SiYuan User Guide",
    ]);

    // const notebookChange = async function () {
    //     // 显示当前选择的名称
    //     const currentNotebook = notebooks.find((n) => n.id === toNotebookId);
    //     toNotebookName = currentNotebook.name;

    //     importerConfig = await loadImporterConfig(pluginInstance);
    //     importerConfig.notebook = toNotebookId;

    //     await saveImporterConfig(pluginInstance, importerConfig);
    //     pluginInstance.logger.info(
    //         `${pluginInstance.i18n.notebookConfigUpdated}=>`,
    //         toNotebookId,
    //     );
    // };

    onMount(async () => {
        const res = await client.lsNotebooks();
        console.log(res);
        const data = res.data as any;
        notebooks = data.notebooks ?? [];
        // 没有必要把所有笔记本都列出来
        notebooks = notebooks.filter(
            (notebook) =>
                !notebook.closed && !hiddenNotebook.has(notebook.name),
        );
        toNotebookId = notebooks[0].id;
        // 选中，若是没保存，获取第一个
        // toNotebookId = importerConfig?.notebook ?? notebooks[0].id;
        // const currentNotebook = notebooks.find((n) => n.id === toNotebookId);
        // toNotebookName = currentNotebook.name;
    });
</script>

<label class="fn__flex b3-label config__item">
    <div class="fn__flex-1">
        <label class="fn__flex b3-label config__item">
            <div class="fn__flex-1">
                {@html i18n.settingsTab.items.notebookDialog.title}
                <div class="b3-label__text">
                    {@html i18n.settingsTab.items.notebookDialog.content}
                </div>
            </div>
            <span class="fn__space" />
            <select
                id="notebook-get"
                class="b3-select fn__flex-center fn__size200"
                bind:value={toNotebookId}
            >
                <!-- on:change={notebookChange} -->
                {#each notebooks as notebook}
                    <option value={notebook.id}>{notebook.name}</option>
                {:else}
                    <option value="0">{i18n.loading}...</option>
                {/each}
            </select>
        </label>
        <SettingItem
            type="range"
            content={i18n.settingsTab.items.depth}
            settingKey="depthNotebook"
            settingValue={settings.get("depthNotebook")}
        />
        <SettingItem
            type="select"
            content={i18n.settingsTab.items.listType}
            settingKey="listTypeNotebook"
            settingValue={settings.get("listTypeNotebook")}
        />
        <SettingItem
            type="select"
            content={i18n.settingsTab.items.linkType}
            settingKey="linkTypeNotebook"
            settingValue={settings.get("linkTypeNotebook")}
        />
        <SettingItem
            type="switch"
            content={i18n.settingsTab.items.icon}
            settingKey="iconNotebook"
            settingValue={settings.get("iconNotebook")}
        />
    </div>
</label>

<div class="button-group" style="float: right;margin: 20px 0 10px;">
    <button id="saveDraw" class="b3-button" on:click={onSave}>
        {i18n.settingsTab.items.notebookDialog.insert}
    </button>
</div>
