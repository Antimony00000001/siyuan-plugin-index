<script lang="ts">
    import TemplateIndexTab from "../template-index-tab.svelte";
    import TemplateNone from "../template-none.svelte";
    import { plugin } from "../../../shared/utils";
    import { eventBus } from "../../../shared/eventbus";
    import { onMount } from "svelte";

    export let tabbarfocus: any;
    let templatefocus = "indexTemplate";

    let templateIndexTab: any;
    let templateoutlineTab: any;

    function addTemplateIndex(name: string) {
        let tn = document.getElementById("templateIndexnone");
        if (tn) {
            tn.remove();
        }
        let element = document.createElement("div");
        new TemplateIndexTab({
            target: element,
            props: {
                name: name,
            },
        });
        templateIndexTab.appendChild(element);
    }

    eventBus.on("addTemplateIndex", addTemplateIndex);

    function addTemplateIndexNone() {
        console.log(templateIndexTab.children.length);
        if (templateIndexTab.children.length == 0) {
            let element = document.createElement("div");
            element.id = "templateIndexnone";
            new TemplateNone({
                target: element,
                props: {
                    tab: "indexSettings",
                },
            });
            templateIndexTab.appendChild(element);
        }
    }

    function addTemplateOutlineNone() {
        console.log(templateoutlineTab.children.length);
        if (templateoutlineTab.children.length == 0) {
            let element = document.createElement("div");
            element.id = "templateoutlinenone";
            new TemplateNone({
                target: element,
                props: {
                    tab: "outlineSettings",
                },
            });
            templateoutlineTab.appendChild(element);
        }
    }

    eventBus.on("addTemplateIndexNone", addTemplateIndexNone);
    eventBus.on("addTemplateOutlineNone", addTemplateOutlineNone);

    onMount(() => {
        eventBus.emit("addTemplateIndexNone");
        eventBus.emit("addTemplateOutlineNone");
    });
</script>

<div
    data-name="template"
    class={tabbarfocus === "template"
        ? "config__tab-container"
        : "config__tab-container fn__none"}
>
    <!-- bind:this={templateTab} -->
    <div class="fn__flex-column" style="height: 100%">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="layout-tab-bar fn__flex">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                data-name="indexTemplate"
                class={templatefocus === "indexTemplate"
                    ? "item item--full item--focus"
                    : "item item--full"}
                on:click={() => {
                    templatefocus = "indexTemplate";
                    // onGetIndexTemplate();
                }}
            >
                <span class="fn__flex-1" />
                <span class="item__text">目录模板</span>
                <span class="fn__flex-1" />
            </div>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                data-name="outlineTemplate"
                class={templatefocus === "outlineTemplate"
                    ? "item item--full item--focus"
                    : "item item--full"}
                on:click={() => {
                    templatefocus = "outlineTemplate";
                    // onGetTemplate();
                }}
            >
                <span class="fn__flex-1" />
                <span class="item__text">大纲模板</span>
                <span class="fn__flex-1" />
            </div>
        </div>
        <div class="fn__flex-1">
            <div
                data-name="indexTemplate"
                class={templatefocus === "indexTemplate"
                    ? "config__tab-container"
                    : "config__tab-container fn__none"}
                bind:this={templateIndexTab}
            >
                {#each Object.entries(plugin.data) as [key]}
                    {#if key != "config" && key.indexOf("index") != -1}
                        <div>
                            <TemplateIndexTab name={key} />
                        </div>
                    {/if}
                {/each}
            </div>
            <div
                data-name="outlineTemplate"
                class={templatefocus === "outlineTemplate"
                    ? "config__tab-container"
                    : "config__tab-container fn__none"}
                bind:this={templateoutlineTab}
            >
                {#each Object.entries(plugin.data) as [key]}
                    {#if key != "config" && key.indexOf("outline") != -1}
                        <div>
                            <!-- <TemplateTab name={key} /> -->
                        </div>
                    {/if}
                {/each}
            </div>
        </div>
    </div>
    <!-- {#each Object.entries(plugin.data) as [key]}
    {#if key != "config"}
        <div>
            <TemplateTab name={key} />
        </div>
    {/if}
{/each} -->
</div>