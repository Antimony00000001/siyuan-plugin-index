<script>
    import { showMessage } from "siyuan";
    import { settings } from "../../core/settings";
    import { i18n } from "../../shared/utils";
    import TemplateItem from "./template-item.svelte";
    import { eventBus } from "../../../legacy/event/eventbus";
    export let name;
    let item;
    let realName = name.substring(9);
    function deleteTemplate() {
        settings.remove(name);
        item.parentNode.remove();
        eventBus.emit("addTemplateoutlineNone");
    }
    // function rename(){
    //     settings.rename(name,"template-"+realName);
    // }
    async function useTemplate() {
        settings.saveTo(name);
        showMessage(
            i18n.templateUsed,
            3000,
            "info"
        );
    }
</script>

<!-- svelte-ignore a11y-label-has-associated-control -->
<label class="fn__flex b3-label config__item" style="flex-direction: column;" id={name} bind:this={item}>
    <div class="fn__flex">
        <!-- <input
            type="text"
            class="fn__size200 b3-text-field"
            placeholder="标题"
            bind:value={realName}
            on:change={rename}
        /> -->
        <div style="font-weight: bold;font-size: 16px;">{realName}</div>
        <div class="fn__flex-1 fn__space" />
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
            class="b3-tooltips b3-tooltips__sw block__icon block__icon--show"
            data-type="switch"
            aria-label={i18n.useTemplate}
            on:click={useTemplate}
        >
            <svg><use xlink:href="#iconSelect" /></svg>
        </span>
        <div class="fn__space" />
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <span
            aria-label={i18n.deleteTemplate}
            class="b3-tooltips b3-tooltips__sw block__icon block__icon--show"
            on:click={deleteTemplate}
        >
            <svg><use xlink:href="#iconTrashcan" /></svg>
        </span>
    </div>
    <div class="fn__hr" />
    <div class="fn__hr" />
    <div class="fn_flex" style="flex-direction: column;">
        <TemplateItem
            type="select"
            content={i18n.settingsTab.items.listTypeOutline}
            settingKey="listTypeOutline"
            settingValue={settings.get("listTypeOutline",name)}
            {name}
        />
        <div class="fn__hr" />
        <TemplateItem
            type="select"
            content={i18n.settingsTab.items.linkType}
            settingKey="linkType"
            settingValue={settings.get("linkType",name)}
            {name}
        />
        <div class="fn__hr" />
        <TemplateItem
            type="switch"
            content={i18n.settingsTab.items.icon}
            settingKey="icon"
            settingValue={settings.get("icon",name)}
            {name}
        />
        <div class="fn__hr" />
        <TemplateItem
            type="range"
            content={i18n.settingsTab.items.depth}
            settingKey="depth"
            settingValue={settings.get("depth",name)}
            {name}
        />
        <div class="fn__hr" />
        <TemplateItem
            type="range"
            content={i18n.settingsTab.items.fold}
            settingKey="fold"
            settingValue={settings.get("fold",name)}
            {name}
        />
        <div class="fn__hr" />
        <TemplateItem
            type="range"
            content={i18n.settingsTab.items.col}
            settingKey="col"
            settingValue={settings.get("col",name)}
            {name}
        />
        <div class="fn__hr" />
        <TemplateItem
            type="switch"
            content={i18n.settingsTab.items.autoUpdate}
            settingKey="autoUpdate"
            settingValue={settings.get("autoUpdate",name)}
            {name}
        />
    </div>
</label>