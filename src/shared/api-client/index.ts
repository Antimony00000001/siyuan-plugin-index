import { Client } from "@siyuan-community/siyuan-sdk";
import { sleep, i18n } from "../utils";

export const client = new Client();

export class BlockService {
    /**
     * 通用插入/更新数据逻辑，支持属性绑定和自动修复大纲结构
     * @param rootId 文档 ID
     * @param data Markdown 数据
     * @param attrName 识别用的属性名 (e.g. "custom-outline-create")
     * @param attrValue 属性值
     * @param type 类型 "index" | "outline" (用于特殊逻辑判断)
     * @param targetBlockId 可选：Slash 命令触发时的目标块 ID (用于替换)
     */
    static async insertOrUpdate(
        rootId: string,
        data: string,
        attrName: string,
        attrValue: any,
        type: "index" | "outline",
        targetBlockId?: string
    ) {
        const attrs = { [attrName]: JSON.stringify(attrValue) };

        try {
            // 1. Check for existing block
            let rs = await client.sql({
                stmt: `SELECT id, type, parent_id FROM blocks WHERE root_id = '${rootId}' AND ial like '%${attrName}%' order by updated desc limit 1`
            });

            if (rs.data[0]?.id == undefined) {
                // === Case: Insert New ===
                console.log(`[BlockService] No existing ${type} found. Inserting new.`);
                let result;
                if (targetBlockId) {
                    result = await client.updateBlock({
                        data: data,
                        dataType: 'markdown',
                        id: targetBlockId
                    });
                } else {
                    result = await client.prependBlock({
                        data: data,
                        dataType: 'markdown',
                        parentID: rootId
                    });
                }

                let opId = result.data[0].doOperations[0].id;
                let attrTargetId = opId;

                // If Outline (Blockquote), find inner List to bind attribute
                if (type == "outline") {
                    console.log(`[BlockService] Outline inserted (ID: ${opId}). Searching for inner list...`);
                    for (let i = 0; i < 10; i++) {
                        await sleep(300);
                        let childRs = await client.sql({ 
                            stmt: `SELECT id FROM blocks WHERE parent_id = '${opId}' AND type = 'l' LIMIT 1` 
                        });
                        if (childRs.data && childRs.data[0]) {
                            attrTargetId = childRs.data[0].id;
                            console.log(`[BlockService] Found inner list for binding: ${attrTargetId}`);
                            break;
                        }
                    }
                }

                await client.setBlockAttrs({
                    attrs: attrs,
                    id: attrTargetId
                });
                
                console.log(`[BlockService] Attributes bound to ${attrTargetId}`);
                return { success: true, msg: "insert_success" };

            } else {
                // === Case: Update Existing ===
                let currentId = rs.data[0].id;
                let updateTargetId = currentId;

                console.log(`[BlockService] Found existing ${type} at ${currentId} (Type: ${rs.data[0].type})`);

                // Outline Fix: If attr is on List, update parent BQ
                if (type == "outline" && rs.data[0].type === 'l') {
                     let parentRs = await client.sql({ stmt: `SELECT id, type FROM blocks WHERE id = '${rs.data[0].parent_id}'` });
                     if (parentRs.data[0] && parentRs.data[0].type === 'b') {
                         updateTargetId = parentRs.data[0].id;
                         console.log(`[BlockService] Updating parent blockquote: ${updateTargetId}`);
                     }
                }

                await client.updateBlock({
                    data: data,
                    dataType: 'markdown',
                    id: updateTargetId
                });

                // Re-bind attributes to ensure they persist or update
                let attrTargetId = updateTargetId;
                if (type == "outline") {
                    console.log(`[BlockService] Outline updated. Re-searching for inner list in ${updateTargetId}...`);
                    for (let i = 0; i < 10; i++) {
                        await sleep(300);
                        let childRs = await client.sql({ 
                            stmt: `SELECT id FROM blocks WHERE parent_id = '${updateTargetId}' AND type = 'l' LIMIT 1` 
                        });
                        if (childRs.data && childRs.data[0]) {
                            attrTargetId = childRs.data[0].id;
                            console.log(`[BlockService] Found new inner list for re-binding: ${attrTargetId}`);
                            break;
                        }
                    }
                }

                await client.setBlockAttrs({
                    attrs: attrs,
                    id: attrTargetId
                });
                
                if (targetBlockId && targetBlockId !== updateTargetId) {
                    await client.deleteBlock({ id: targetBlockId });
                }

                console.log(`[BlockService] Attributes re-bound to ${attrTargetId}`);
                return { success: true, msg: "update_success" };
            }
        } catch (error) {
            console.error("[BlockService] insertOrUpdate error:", error);
            throw error;
        }
    }
}
