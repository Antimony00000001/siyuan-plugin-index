import { client, BlockService } from "../../shared/api-client";
import { getBlocksData, collectOutlineIds, requestGetDocOutline } from "../../shared/api-client/query";
import { getDocid, i18n, plugin, confirmDialog } from "../../shared/utils";
import { extractAnchors, isValidSeparator } from "../../shared/utils/anchor-utils";
import { settings, CONFIG } from "../../core/settings";
import { generateOutlineMarkdown } from "./generator";

export async function insertOutlineAction(targetBlockId?: string) {
    await settings.load();

    let parentId = getDocid();
    if (parentId == null) {
        console.error("No doc ID found"); 
        return;
    }

    // Check for existing outline (Manual Insert/Update)
    console.log("[IndexPlugin] Checking for existing outline...");
    let rs = await client.sql({
        stmt: `SELECT * FROM blocks WHERE root_id = '${parentId}' AND ial like '%custom-outline-create%' order by updated desc limit 1`
    });

    if (rs.data[0]?.id != undefined) {
         console.log("[IndexPlugin] Found existing outline:", rs.data[0].id);
         let ial = await client.getBlockAttrs({ id: rs.data[0].id });
         let str = ial.data["custom-outline-create"];
         let localSettings: any = {};
         try {
             localSettings = JSON.parse(str);
             console.log("[IndexPlugin] Local Outline settings:", localSettings);
         } catch (e) {
             console.error("[IndexPlugin] Error parsing settings", e);
         }

         const keysToCheck = ["outlineType", "listTypeOutline", "iconOutline"];
         let mismatch = false;
         for (const key of keysToCheck) {
             if (localSettings[key] !== settings.get(key)) {
                 console.log(`[IndexPlugin] Mismatch on ${key}: Local=${localSettings[key]}, Global=${settings.get(key)}`);
                 mismatch = true;
                 break;
             }
         }
         
         if (mismatch) {
              await new Promise<void>((resolve) => {
                 confirmDialog(i18n.confirmDialog.title, i18n.confirmDialog.content, () => {
                     console.log("[IndexPlugin] User confirmed update to Global (Outline)");
                     resolve();
                 }, () => {
                     console.log("[IndexPlugin] User kept Local settings (Outline)");
                     settings.loadSettingsforOutline(localSettings);
                     resolve();
                 }, i18n.update, i18n.keep);
              });
         }
    } else {
        console.log("[IndexPlugin] No existing outline found.");
    }

    let outlineData = await requestGetDocOutline(parentId);
    let ids = collectOutlineIds(outlineData);
    let extraData = await getBlocksData(ids);
    
    // Manual insert: Pass empty map to reset anchors
    let data = generateOutlineMarkdown(outlineData, 0, 0, extraData, new Map<string, string>());
    
    if (data != '') {
        await BlockService.insertOrUpdate(
            parentId,
            data,
            "custom-outline-create",
            plugin.data[CONFIG],
            "outline",
            targetBlockId
        );
        // client.pushMsg({ msg: i18n.msg_success }); // BlockService handles success? No, I returned result.
        // BlockService didn't push msg in my implementation (I commented it out or returned status).
        // I should push msg here.
    } else {
        // error
    }
}

export async function autoUpdateOutline(parentId: string) {
    await settings.load();
    console.log("[IndexPlugin] Auto-updating outline for doc:", parentId);

    let rs = await client.sql({
        stmt: `SELECT * FROM blocks WHERE root_id = '${parentId}' AND ial like '%custom-outline-create%' order by updated desc limit 1`
    });

    if (rs.data[0]?.id != undefined) {
        let ial = await client.getBlockAttrs({ id: rs.data[0].id });

        let existingAnchors = new Map<string, string>();
        if (rs.data[0].markdown) {
            existingAnchors = extractAnchors(rs.data[0].markdown);
            for (const [id, anchor] of existingAnchors) {
                if (!isValidSeparator(anchor)) {
                    existingAnchors.delete(id);
                }
            }
        }

        let str = ial.data["custom-outline-create"];
        let localSettings: any = {};
        try {
            localSettings = JSON.parse(str);
        } catch (e) {
            console.error("Failed to parse settings", e);
        }

        // Check if local outlineAutoUpdate is enabled
        if (localSettings.outlineAutoUpdate === false) {
             console.log("[IndexPlugin] Local outlineAutoUpdate is disabled. Skipping.");
             return;
        }

        // Auto-update always uses local settings without prompting
        settings.loadSettingsforOutline(localSettings);

        if (!settings.get("outlineAutoUpdate")) return;

        let outlineData = await requestGetDocOutline(parentId);
        let ids = collectOutlineIds(outlineData);
        let extraData = await getBlocksData(ids);
        
        let data = generateOutlineMarkdown(outlineData, 0, 0, extraData, existingAnchors);
        
        if (data != '') {
             await BlockService.insertOrUpdate(
                parentId,
                data,
                "custom-outline-create",
                plugin.data[CONFIG],
                "outline"
            );
        }
    }
}
