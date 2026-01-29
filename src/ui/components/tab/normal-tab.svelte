<script lang="ts">
    import { onCreateTemplateButton } from "../../../../legacy/creater/createtemplate";
    import { SettingsProperty } from "../../../core/settings";
    import { i18n } from "../../../shared/utils";
    import SettingItem from "../setting-item.svelte";

    export let tabbarfocus : any;
    export let normalfocus : any;
    export let settingsStrings : SettingsProperty;
</script>

<div
    data-name="normal"
    class={tabbarfocus === "normal"
        ? "config__tab-container"
        : "config__tab-container fn__none"}
>
    <div class="fn__flex-column" style="height: 100%">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="layout-tab-bar fn__flex">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                data-name="indexSettings"
                class={normalfocus === "indexSettings"
                    ? "item item--full item--focus"
                    : "item item--full"}
                on:click={() => {
                    normalfocus = "indexSettings";
                    // onGetIndexTemplate();
                }}
            >
                <span class="fn__flex-1" />
                <span class="item__text">{i18n.indexSettings}</span>
                <span class="fn__flex-1" />
            </div>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                data-name="outlineSettings"
                class={normalfocus === "outlineSettings"
                    ? "item item--full item--focus"
                    : "item item--full"}
                on:click={() => {
                    normalfocus = "outlineSettings";
                    // onGetTemplate();
                }}
            >
                <span class="fn__flex-1" />
                <span class="item__text">{i18n.outlineSettings}</span>
                <span class="fn__flex-1" />
            </div>
        </div>
        <div class="fn__flex-1">
            <div
                data-name="indexSettings"
                class={normalfocus === "indexSettings"
                    ? "config__tab-container"
                    : "config__tab-container fn__none"}
            >
                <!-- bind:this={templateTab} -->
                <SettingItem
                    type="select"
                    content={i18n.settingsTab.items.insertionMode}
                    settingKey="insertionMode"
                    settingValue={settingsStrings.insertionMode}
                />
                <SettingItem
                    type="select"
                    content={i18n.settingsTab.items.listType}
                    settingKey="listType"
                    settingValue={settingsStrings.listType}
                />
                <SettingItem
                    type="select"
                    content={i18n.settingsTab.items.linkType}
                    settingKey="linkType"
                    settingValue={settingsStrings.linkType}
                />
                <SettingItem
                    type="range"
                    content={i18n.settingsTab.items.depth}
                    settingKey="depth"
                    settingValue={settingsStrings.depth}
                />
                <SettingItem
                    type="range"
                    content={i18n.settingsTab.items.fold}
                    settingKey="fold"
                    settingValue={settingsStrings.fold}
                />
                <SettingItem
                    type="range"
                    content={i18n.settingsTab.items.col}
                    settingKey="col"
                    settingValue={settingsStrings.col}
                />
                <SettingItem
                    type="switch"
                    content={i18n.settingsTab.items.autoUpdate}
                    settingKey="autoUpdate"
                    settingValue={settingsStrings.autoUpdate}
                />
                <label
                    class="fn__flex b3-label config__item"
                    style="flex-direction: column;"
                >
                    <div class="fn__flex">
                        <div class="fn__flex-1" />
                        <button
                            class="b3-button b3-button--outline fn__flex-center fn__size200"
                            id="createtemplate"
                            on:click={onCreateTemplateButton}
                        >
                            <svg><use xlink:href="#iconAdd" /></svg>
                            {i18n.settingsTab.items.createTemplate}
                        </button>
                    </div>
                </label>
            </div>
            <div
                data-name="outlineSettings"
                class={normalfocus === "outlineSettings"
                    ? "config__tab-container"
                    : "config__tab-container fn__none"}
            >
                <SettingItem
                    type="select"
                    content={i18n.settingsTab.items.listTypeOutline}
                    settingKey="listTypeOutline"
                    settingValue={settingsStrings.listTypeOutline}
                />
                <SettingItem
                    type="select"
                    content={i18n.settingsTab.items.outlineType}
                    settingKey="outlineType"
                    settingValue={settingsStrings.outlineType}
                />
                <SettingItem
                    type="switch"
                    content={i18n.settingsTab.items.outlineAutoUpdate}
                    settingKey="outlineAutoUpdate"
                    settingValue={settingsStrings.outlineAutoUpdate}
                />
                <!-- <label
                class="fn__flex b3-label config__item"
                style="flex-direction: column;"
            >
                <div class="fn__flex">
                    <div class="fn__flex-1" />
                    <button
                        class="b3-button b3-button--outline fn__flex-center fn__size200"
                        id="createtemplate"
                        on:click={onCreateTemplateButton}
                    >
                        <svg><use xlink:href="#iconAdd" /></svg>
                        {i18n.settingsTab.items.createTemplate}
                    </button>
                </div>
            </label> -->
            </div>
        </div>
    </div>
</div>