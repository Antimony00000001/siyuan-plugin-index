<script lang="ts">
    import { onDestroy } from "svelte";
    import { settings, SettingsProperty } from "../settings";
    import { i18n } from "../utils";
    import { eventBus } from "../event/eventbus";
    import NormalTab from "./tab/normal-tab.svelte";
    import TemplateTab from "./tab/template-tab.svelte";
    import ExtraTab from "./tab/extra-tab.svelte";
    import { onGetTemplate } from "../creater/createtemplate";

    let settingsStrings = new SettingsProperty();
    settingsStrings.getAll();

    let tabbarfocus = "normal";
    let normalfocus = "indexSettings";

    function switchTab(tab: string, top: string) {
        tabbarfocus = tab;
        normalfocus = top;
    }

    eventBus.on("switchTab", switchTab);

    async function updateSettings() {
        await settings.load();
        settingsStrings.depth = settings.get("depth");
        settingsStrings.listType = settings.get("listType");
        settingsStrings.linkType = settings.get("linkType");
        //       autoUpdate = settings.get("autoUpdate");
        settingsStrings.col = settings.get("col");
        settingsStrings.fold = settings.get("fold");
    }
    eventBus.on("updateSettings", updateSettings);



    onDestroy(() => {
        settings.save();
    });
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <li
            data-name="normal"
            class={tabbarfocus === "normal"
                ? "b3-list-item--focus b3-list-item"
                : "b3-list-item"}
            on:click={() => {
                tabbarfocus = "normal";
                eventBus.emit("updateSettings");
            }}
        >
            <svg class="b3-list-item__graphic"
                ><use xlink:href="#iconSettings" /></svg
            >
            <span class="b3-list-item__text">{i18n.generalSettings}</span>
        </li>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <li
            data-name="template"
            class={tabbarfocus === "template"
                ? "b3-list-item--focus b3-list-item"
                : "b3-list-item"}
            on:click={() => {
                tabbarfocus = "template";
                onGetTemplate();
            }}
        >
            <svg class="b3-list-item__graphic"
                ><use xlink:href="#iconBazaar" /></svg
            >
            <span class="b3-list-item__text">{i18n.templateSettings}</span>
        </li>
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <li
            data-name="extra"
            class={tabbarfocus === "extra"
                ? "b3-list-item--focus b3-list-item"
                : "b3-list-item"}
            on:click={() => (tabbarfocus = "extra")}
        >
            <svg class="b3-list-item__graphic"
                ><use xlink:href="#iconSQL" /></svg
            >
            <span class="b3-list-item__text">{i18n.extraSettings}</span>
        </li>
    </ul>
    <div class="config__tab-wrap">
        <NormalTab
            tabbarfocus = {tabbarfocus}
            normalfocus = {normalfocus}
            settingsStrings = {settingsStrings}
        />

        <TemplateTab
            tabbarfocus = {tabbarfocus}
        />

        <ExtraTab
            tabbarfocus = {tabbarfocus}
            settingsStrings = {settingsStrings}
        />
    </div>
</div>
