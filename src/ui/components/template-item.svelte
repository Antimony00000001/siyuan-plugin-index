<script>
    import { settings } from "../../core/settings";

    export let type; // 设置项目类型
    export let content; // 设置项目内部文本展示
    export let settingKey; // 设置项目 key
    export let settingValue; // 设置项目初始值
    export let name;

    function updateSetting() {
        settings.set(settingKey, settingValue, name);
        settings.save(name);
    }
</script>

<div class="fn__flex">
    <div class="fn__flex-1 fn__flex-center">
        {content.title}
    </div>
    {#if type === "range"}
        <div
            class="b3-tooltips b3-tooltips__n fn__flex-center"
            aria-label={settingValue}
        >
            <input
                class="b3-slider fn__size200"
                id={settingKey}
                type="range"
                min={content.min}
                max={content.max}
                step={content.step}
                bind:value={settingValue}
                on:change={updateSetting}
            />
        </div>
    {:else if type === "switch"}
        <input
            class="b3-switch fn__flex-center"
            id={settingKey}
            type="checkbox"
            bind:checked={settingValue}
            on:change={updateSetting}
        />
    {:else if type === "select"}
        <select
            class="b3-select fn__flex-center fn__size200"
            id={settingKey}
            bind:value={settingValue}
            on:change={updateSetting}
        >
            {#each Object.entries(content.options) as [key, text]}
                <option value={key}>{text}</option>
            {/each}
        </select>
    {/if}
</div>