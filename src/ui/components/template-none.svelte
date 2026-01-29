<script>
    import { eventBus } from "../../../legacy/event/eventbus";
    import { i18n } from "../../shared/utils";

    export let tab;
</script>

<!-- 删除 -->

<div class="b3-label">
    <div class="b3-label b3-label--inner">
        {i18n.nothasTemplate}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <!-- svelte-ignore a11y-missing-attribute -->
        <a
            on:click={() => {
                eventBus.emit("switchTab", "normal", tab);
                console.log("switchTab");
            }}
        >
            {i18n.cliketoAdd}
        </a>
    </div>
</div>
