<script lang="ts">
    import { onMount } from "svelte";
    import { i18n } from "../../utils";

    export let onSelect: (emoji: string) => void;
    
    // Data
    let emojis: any[] = [];
    let filteredEmojis: any[] = [];
    let searchText = "";
    let panelElement: HTMLElement;
    
    // State
    let activeTab = "emoji"; // 'emoji' | 'dynamic'
    
    onMount(() => {
        const siyuan = (window as any).siyuan;
        if (siyuan && siyuan.emojis) {
            // Filter out the "custom" category as it's not supported
            emojis = siyuan.emojis.filter(category => category.id !== "custom");
            filteredEmojis = emojis;
        }
    });

    function unicode2Emoji(unicode: string) {
        if (!unicode) return "";
        
        // Hex sequence regex (only hex chars, dots, and hyphens)
        const hexPattern = /^[0-9a-fA-F]+([.-][0-9a-fA-F]+)*$/;
        
        if (hexPattern.test(unicode)) {
            try {
                // Split by either . or -
                if (unicode.indexOf(".") > -1 || unicode.indexOf("-") > -1) {
                    const result = unicode.split(/[.-]/).map(item => String.fromCodePoint(parseInt(item, 16))).join("");
                    return result;
                } else {
                    const result = String.fromCodePoint(parseInt(unicode, 16));
                    return result;
                }
            } catch (e) {
                return unicode;
            }
        }
        
        // Fallback for non-hex strings (should be rare if custom emojis are removed from UI)
        return unicode;
    }

    function filterEmoji() {
        if (!searchText) {
            filteredEmojis = emojis;
            return;
        }
        
        const lowerSearch = searchText.toLowerCase();
        const result = [];
        
        for (const category of emojis) {
            const matchingItems = category.items.filter(item => 
                (item.description && item.description.toLowerCase().includes(lowerSearch)) || 
                (item.keywords && item.keywords.toLowerCase().includes(lowerSearch)) ||
                (item.unicode && item.unicode.includes(lowerSearch))
            );
            
            if (matchingItems.length > 0) {
                result.push({
                    ...category,
                    items: matchingItems
                });
            }
        }
        filteredEmojis = result;
    }

    function selectEmoji(emojiHex: string) {
        if (onSelect) {
            // Determine if it's a unicode hex
            const hexPattern = /^[0-9a-fA-F]+([.-][0-9a-fA-F]+)*$/;
            
            if (hexPattern.test(emojiHex)) {
                // It's a hex sequence, convert to character
                try {
                    let converted = "";
                    if (emojiHex.indexOf(".") > -1 || emojiHex.indexOf("-") > -1) {
                         converted = emojiHex.split(/[.-]/).map(item => String.fromCodePoint(parseInt(item, 16))).join("");
                    } else {
                         converted = String.fromCodePoint(parseInt(emojiHex, 16));
                    }
                    onSelect(converted);
                } catch (e) {
                    // Fallback to raw if conversion fails
                    onSelect(emojiHex);
                }
            } else {
                // Pass as is (might be direct character)
                onSelect(emojiHex);
            }
        }
    }

    function pickRandom() {
        const allItems = emojis.flatMap(cat => cat.items);
        if (allItems.length > 0) {
            const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
            selectEmoji(randomItem.unicode);
        }
    }

    function scrollToCategory(index) {
        if (panelElement) {
             const title = panelElement.querySelector(`[data-category-index="${index}"]`);
             if (title) title.scrollIntoView({ behavior: 'smooth' });
        }
    }
</script>

<div class="emojis">
    <!-- Tab Header -->
    <div class="emojis__tabheader">
        <div class="ariaLabel block__icon block__icon--show {activeTab === 'emoji' ? 'block__icon--active' : ''}" aria-label="Emoji" on:click={() => activeTab = 'emoji'} on:keydown={() => {}}>
            <svg><use xlink:href="#iconEmoji"></use></svg>
        </div>
        <div class="fn__space"></div>
        <div class="ariaLabel block__icon block__icon--show {activeTab === 'dynamic' ? 'block__icon--active' : ''}" aria-label="Dynamic Icon" on:click={() => activeTab = 'dynamic'} on:keydown={() => {}}>
            <svg><use xlink:href="#iconCalendar"></use></svg>
        </div>
        <div class="fn__flex-1"></div>
        <span class="block__icon block__icon--show fn__flex-center ariaLabel" aria-label="Remove" on:click={() => selectEmoji("")} on:keydown={() => {}}>
            <svg><use xlink:href="#iconTrashcan"></use></svg>
        </span>
    </div>

    <div class="emojis__tabbody">
        {#if activeTab === 'emoji'}
        <div data-type="tab-emoji">
             <div class="fn__hr"></div>
             <!-- Search Bar -->
             <div class="fn__flex">
                <span class="fn__space"></span>
                <label class="b3-form__icon fn__flex-1" style="overflow:initial;">
                    <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                    <input class="b3-form__icon-input b3-text-field fn__block" placeholder={i18n?.search || "Search"} bind:value={searchText} on:input={filterEmoji}>
                </label>
                <span class="fn__space"></span>
                <span class="block__icon block__icon--show fn__flex-center ariaLabel" aria-label="Random" on:click={pickRandom} on:keydown={() => {}}>
                    <svg><use xlink:href="#iconRefresh"></use></svg>
                </span>
                <span class="fn__space"></span>
            </div>

            <!-- Emoji Grid Panel -->
            <div class="emojis__panel" bind:this={panelElement}>
                {#each filteredEmojis as category, index}
                    <div class="emojis__title" data-category-index={index}>
                        {category.title}
                    </div>
                    <div class="emojis__content">
                        {#each category.items as item}
                            <button class="emojis__item ariaLabel" aria-label={item.description} on:click={() => selectEmoji(item.unicode)}>
                                {@html unicode2Emoji(item.unicode)}
                            </button>
                        {/each}
                    </div>
                {/each}
            </div>
            
             <!-- Category Bottom Bar -->
             <div class="fn__flex" style="overflow-x: auto; padding: 4px 0;">
                {#each emojis as category, index}
                     <div class="emojis__type ariaLabel" aria-label={category.title} on:click={() => scrollToCategory(index)} on:keydown={() => {}}>
                         <!-- Use the first emoji as icon if available, or a generic icon -->
                         {#if category.items[0]?.unicode}
                             {@html unicode2Emoji(category.items[0].unicode)}
                         {:else}
                             <svg><use xlink:href="#iconEmoji"></use></svg>
                         {/if}
                     </div>
                {/each}
             </div>
        </div>
        {:else}
        <!-- Dynamic Icon Tab Placeholder -->
        <div data-type="tab-dynamic">
            <div class="fn__hr"></div>
            <div style="padding: 20px; text-align: center; color: var(--b3-theme-on-surface-light);">
                Dynamic icons logic is not implemented in this plugin yet.
            </div>
        </div>
        {/if}
    </div>
</div>

<style>
.emojis {
  word-break: break-all;
  white-space: normal;
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  height: 100%;
  box-sizing: border-box;
}

.emojis__tabheader {
    display: flex;
    border-bottom: 1px solid var(--b3-border-color);
    padding: 0 8px 8px;
}

.emojis__tabbody {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
}

div[data-type="tab-emoji"] {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.emojis__item {
    font-size: 19px;
    font-family: var(--b3-font-family-emoji);
    text-align: center;
    height: 32px;
    padding: 4px;
    cursor: pointer;
    display: inline-block;
    transition: var(--b3-transition);
    background-color: transparent;
    border: 0;
    margin: 1px;
    overflow: hidden;
    border-radius: var(--b3-border-radius);
    width: 32px;
}

.emojis__item img, .emojis__item svg {
    height: 24px;
    display: block;
    width: 24px;
    margin: 0 auto;
}

.emojis__item:hover {
    background: var(--b3-list-hover);
}

.emojis__title {
    color: var(--b3-theme-on-surface);
    padding: 8px 4px 4px 4px;
    font-weight: bold;
}

.emojis__panel {
    flex: 1;
    overflow: auto;
    padding: 0 8px;
}

.emojis__content {
    display: flex;
    flex-wrap: wrap;
}

.emojis__type {
    cursor: pointer;
    flex: 1;
    min-width: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    line-height: 28px;
    transition: var(--b3-list-hover);
    font-size: 16px;
    background-color: transparent;
    border: 0;
    padding: 0;
    font-family: var(--b3-font-family-emoji);
}

.emojis__type:hover {
    background-color: var(--b3-theme-surface-lighter);
}

.emojis__type svg, .emojis__type img {
    height: 16px;
    width: 16px;
}
</style>
