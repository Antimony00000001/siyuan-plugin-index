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
                stmt: `SELECT * FROM blocks WHERE root_id = '${rootId}' AND ial like '%${attrName}%' order by updated desc limit 1`
            });

            if (rs.data[0]?.id == undefined) {
                // === Case: Insert New ===
                let result;
                if (targetBlockId) {
                    // Slash command: Replace target
                    result = await client.updateBlock({
                        data: data,
                        dataType: 'markdown',
                        id: targetBlockId
                    });
                } else {
                    // Button: Prepend to doc (Top)
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
                    for (let i = 0; i < 5; i++) {
                        await sleep(300);
                        let childRs = await client.sql({ stmt: `SELECT id FROM blocks WHERE parent_id = '${opId}' LIMIT 1` });
                        if (childRs.data[0]) {
                            attrTargetId = childRs.data[0].id;
                            break;
                        }
                    }
                }

                await client.setBlockAttrs({
                    attrs: attrs,
                    id: attrTargetId
                });
                
                // Provide feedback via client pushMsg? Or let caller handle?
                // For shared service, maybe better to return result and let caller handle UI?
                // But for 1:1 port, we can keep it here or use a callback.
                // keeping it simple: return success status.
                return { success: true, msg: "insert_success" };

            } else {
                // === Case: Update Existing ===
                let currentId = rs.data[0].id;
                let updateTargetId = currentId;

                // Outline Fix: If attr is on List, update parent BQ
                if (type == "outline" && rs.data[0].type === 'l') {
                     let parentRs = await client.sql({ stmt: `SELECT id, type FROM blocks WHERE id = '${rs.data[0].parent_id}'` });
                     if (parentRs.data[0] && parentRs.data[0].type === 'b') {
                         updateTargetId = parentRs.data[0].id;
                     }
                }

                let result = await client.updateBlock({
                    data: data,
                    dataType: 'markdown',
                    id: updateTargetId
                });

                let opId = result.data[0].doOperations[0].id;
                let attrTargetId = opId;

                // Re-bind to new inner List
                if (type == "outline") {
                    for (let i = 0; i < 5; i++) {
                        await sleep(300);
                        let childRs = await client.sql({ stmt: `SELECT id FROM blocks WHERE parent_id = '${opId}' LIMIT 1` });
                        if (childRs.data[0]) {
                            attrTargetId = childRs.data[0].id;
                            break;
                        }
                    }
                }

                await client.setBlockAttrs({
                    attrs: attrs,
                    id: attrTargetId
                });
                
                if (targetBlockId) {
                    await client.deleteBlock({ id: targetBlockId });
                }

                return { success: true, msg: "update_success" };
            }
        } catch (error) {
            console.error("BlockService insertOrUpdate error:", error);
            throw error;
        }
    }
}
