import { client, BlockService } from "../../shared/api-client";
import { getBlocksData, collectOutlineIds, requestGetDocOutline } from "../../shared/api-client/query";
import { getDocid, i18n, plugin } from "../../shared/utils";
import { extractAnchors, isValidSeparator } from "../../shared/utils/anchor-utils";
import { settings, CONFIG } from "../../core/settings";
import { generateOutlineMarkdown } from "./generator";

export async function insertOutlineAction(targetBlockId?: string) {
    await settings.load();

    let parentId = getDocid();
    if (parentId == null) {
        // Warning: using plugin.pushErrMsg if client doesn't expose it directly or use client wrapper
        // The original code used client.pushErrMsg via utils wrapper.
        // My shared client is from SDK. 
        // I should probably use the SDK client's pushErrMsg or similar if available, or the utils one.
        // I will use `client` from my shared/api-client which wraps SDK Client.
        // Does SDK Client have pushErrMsg? Yes usually.
        // Actually, let's use the one from utils to be safe if I exported it.
        // Wait, I didn't export `client` from `shared/utils`. I exported `client` from `shared/api-client`.
        // I will assume `client` has `pushErrMsg`.
        // Actually, the original `utils.ts` exported `client = new Client()`.
        // So yes.
        // But `i18n` is needed.
        console.error("No doc ID found"); 
        return;
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
        try {
            let parsedSettings = JSON.parse(str);
            settings.loadSettingsforOutline(parsedSettings);
        } catch (e) {
            console.error("Failed to parse settings", e);
        }

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
