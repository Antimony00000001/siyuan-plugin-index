import { settings, CONFIG } from "../../core/settings";
import { getDocid, i18n, plugin } from "../../shared/utils";
import { BlockService, client } from "../../shared/api-client";
import { IndexQueue } from "../../shared/utils/index-queue";
import { generateIndex, generateIndexAndOutline, queuePopAll } from "./generator";
// import { insertNotebookButton } from "../../../src/creater/createIndex"; // Legacy import

export async function insertAction(targetBlockId?: string) {
    await settings.load();
    const mode = settings.get("insertionMode");

    if (mode === "index_outline") {
        await insertIndexAndOutlineAction(targetBlockId);
        return;
    } else if (mode === "notebook") {
        // Temporary: Call legacy function for Notebook until refactored
        // Assuming the legacy code is still accessible and working
        const { insertNotebookButton } = await import("../../../src/creater/createIndex");
        await insertNotebookButton();
        return;
    }

    let parentId = getDocid();
    if (!parentId) {
        // console.error("No doc ID"); 
        // Should show error msg
        return;
    }

    let block = await client.getBlockInfo({ id: parentId });
    if (!block.data) return;

    let indexQueue = new IndexQueue();
    await generateIndex(block.data.box, block.data.path, indexQueue);
    let data = queuePopAll(indexQueue, "");

    if (data != '') {
        await BlockService.insertOrUpdate(
            parentId,
            data,
            "custom-index-create",
            plugin.data[CONFIG],
            "index",
            targetBlockId
        );
        // client.pushMsg({ msg: i18n.msg_success });
    } else {
        // client.pushErrMsg
    }
}

async function insertIndexAndOutlineAction(targetBlockId?: string) {
    let parentId = getDocid();
    if (!parentId) return;

    let block = await client.getBlockInfo({ id: parentId });
    if (!block.data) return;

    let indexQueue = new IndexQueue();
    await generateIndexAndOutline(block.data.box, block.data.path, indexQueue);
    let data = queuePopAll(indexQueue, "");

    if (data != '') {
        // Legacy insertButton used insertDataSimple (Prepend, No Attr).
        // If we want to support Slash replacement, we should use BlockService but maybe without Attr?
        // Or just use prependBlock directly if we don't want to save "custom-index-create" for this mode?
        // Legacy behavior: No auto-update for Index+Outline.
        // So we just insert.
        
        if (targetBlockId) {
             await client.updateBlock({ data: data, dataType: "markdown", id: targetBlockId });
        } else {
             await client.prependBlock({ data: data, dataType: "markdown", parentID: parentId });
        }
        // client.pushMsg({ msg: i18n.msg_success });
    }
}

export async function autoUpdateIndex(notebookId: string, path: string, parentId: string) {
    await settings.load();

    let rs = await client.sql({
        stmt: `SELECT * FROM blocks WHERE root_id = '${parentId}' AND ial like '%custom-index-create%' order by updated desc limit 1`
    });

    if (rs.data[0]?.id != undefined) {
        let ial = await client.getBlockAttrs({ id: rs.data[0].id });
        let str = ial.data["custom-index-create"];
        
        try {
            settings.loadSettings(JSON.parse(str));
        } catch (e) {
            console.error("Error parsing settings", e);
        }

        if (!settings.get("autoUpdate")) return;

        let indexQueue = new IndexQueue();
        await generateIndex(notebookId, path, indexQueue);
        let data = queuePopAll(indexQueue, "");

        if (data != '') {
            // Note: Auto update uses insertDataAfter in legacy.
            // BlockService.insertOrUpdate handles update correctly.
            // We pass the same attr name/value to preserve it.
            await BlockService.insertOrUpdate(
                parentId,
                data,
                "custom-index-create",
                plugin.data[CONFIG],
                "index"
            );
        }
    }
}
