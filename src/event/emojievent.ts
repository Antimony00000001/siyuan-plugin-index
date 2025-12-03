import { Dialog } from "siyuan";
import EmojiDialog from "../components/dialog/emoji-dialog.svelte";
import { client } from "../utils";

/**
 * Initialize the emoji event listener for Alt+Click
 */
export function initEmojiEvent() {
    window.addEventListener("click", handleAltClick, true);
}

export function removeEmojiEvent() {
    window.removeEventListener("click", handleAltClick, true);
}

async function handleAltClick(event: MouseEvent) {
    if (!event.altKey) return;

    const target = event.target as HTMLElement;
    const textContent = target.textContent?.trim() || "";

    // Matches:
    // 1. Standard Unicode Emojis (including surrogate pairs, ZWJ sequences, etc.)
    //    \p{Extended_Pictographic} covers most emojis.
    //    The sequence pattern handles ZWJ (\u200d) combinations.
    const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})(\u200d(\p{Extended_Pictographic}|\p{Emoji_Presentation}))*$/u;

    if (textContent && emojiRegex.test(textContent)) {
        event.preventDefault();
        event.stopPropagation();
        
        const blockElement = target.closest('[data-node-id]');
        if (!blockElement) return;
        
        const blockId = blockElement.getAttribute('data-node-id');
        
        showEmojiMenu(event.clientX, event.clientY, blockId, textContent);
    }
}

function showEmojiMenu(x: number, y: number, blockId: string | null, oldEmoji: string) {
    const dialog = new Dialog({
        title: "Emoji",
        content: `<div class="emoji-dialog-content" style="height: 100%; display: flex; flex-direction: column;"></div>`,
        width: "360px",
        height: "460px",
    });
    
    const target = dialog.element.querySelector(".emoji-dialog-content");
    if (target) {
        new EmojiDialog({
            target: target,
            props: {
                onSelect: (emoji: string) => {
                    if (blockId && emoji !== undefined) {
                        // If emoji is empty string, it means remove
                        if (emoji === "") {
                             replaceEmojiInBlock(blockId, oldEmoji, "");
                        } else {
                             replaceEmojiInBlock(blockId, oldEmoji, emoji);
                        }
                    }
                    dialog.destroy();
                }
            }
        });
    }
}

async function replaceEmojiInBlock(blockId: string, oldEmoji: string, newEmoji: string) {
    try {
        const response = await client.getBlockKramdown({ id: blockId });
        if (!response.data) return;
        
        let kramdown = response.data.kramdown;

        // Simple text replacement for Unicode emojis
        if (kramdown.includes(oldEmoji)) {
            const newKramdown = kramdown.replace(oldEmoji, newEmoji);
            
            await client.updateBlock({
                id: blockId,
                data: newKramdown,
                dataType: "markdown"
            });
        } else {
             console.warn("Could not find old emoji in kramdown", oldEmoji);
        }

    } catch (e) {
        console.error("Failed to replace emoji", e);
    }
}
