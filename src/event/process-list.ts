import { client } from "../utils";
import { IBlockProcessor } from "./process-iblock";

/**
 * 块标菜单回调
 * @param detail 事件细节
 * @returns void
 */
export function buildDoc({ detail }: any) {
    const { menu, blockElements } = detail;
    if (!blockElements || blockElements.length === 0) return;

    const blockElement = blockElements[0];
    const blockId = blockElement.getAttribute("data-node-id");
    const blockType = blockElement.getAttribute("data-type");

    // Only show for List or ListItem
    if (blockType !== "NodeList" && blockType !== "NodeListItem") return;

    // Add Smart Selector menu items
    menu.addSeparator();

    menu.addItem({
        icon: "iconUpload",
        label: "📤 构建子文档",
        click: () => syncManager(blockId, blockType, "PUSH_TO_DOC")
    });

    menu.addItem({
        icon: "iconDownload",
        label: "👇 构建标题行",
        click: () => syncManager(blockId, blockType, "PUSH_TO_BOTTOM")
    });

    menu.addItem({
        icon: "iconDownload",
        label: "📥 从子文档拉取",
        click: () => syncManager(blockId, blockType, "PULL_FROM_DOC")
    });

    menu.addItem({
        icon: "iconUpload",
        label: "👆 从标题行拉取",
        click: () => syncManager(blockId, blockType, "PULL_FROM_BOTTOM")
    });
}

async function syncManager(sourceBlockId: string, sourceType: string, actionType: string) {
    try {
      const processor = new ListProcessor();
      await processor.processRecursive(sourceBlockId, sourceType, actionType);
      
      if (processor.errors.length > 0) {
          client.pushMsg({
              msg: `⚠️ 部分条目因格式复杂未更新文本 (x${processor.errors.length})，仅更新了图标`,
              timeout: 5000
          });
      } else {
          client.pushMsg({
              msg: "✅ 同步完成",
              timeout: 3000
          });
      }
    } catch (e) {
      console.error(e);
      client.pushErrMsg({
          msg: `同步失败: ${e.message}`,
          timeout: 5000
      });
    }
}

export class ListProcessor {
    errors: string[] = [];
    ibp: IBlockProcessor;

    constructor() {
        this.ibp = new IBlockProcessor(this.errors);
    }

    async processRecursive(blockId: string, type: string, actionType: string, ctx: any = null) {
        if (!ctx) {
            ctx = { previousId: null, parentId: null, level: 1 };
        }
        
        const shouldReverse = actionType === "PUSH_TO_DOC";

        if (type === "NodeListItem" || type === "i") {
            const resultId = await this.ibp.processSingleItem(blockId, actionType, ctx);
            if (resultId) ctx.previousId = resultId;

            const childCtx = {
                previousId: ctx.previousId,
                parentId: (actionType === "PUSH_TO_DOC" || actionType === "PULL_FROM_DOC") ? resultId : ctx.parentId,
                level: ctx.level + 1
            };

            let childrenRes = await client.sql({
                stmt: `SELECT id, type, subtype FROM blocks WHERE parent_id = '${blockId}' AND type = 'l' ORDER BY sort ASC`
            });
            let children = childrenRes.data || [];
            if (shouldReverse) children = children.reverse();

            for (const child of children) {
                await this.processRecursive(child.id, "NodeList", actionType, childCtx);
                ctx.previousId = childCtx.previousId;
            }
            return resultId;

        } else if (type === "NodeList" || type === "l") { 
            let childrenRes = await client.sql({
                stmt: `SELECT id, type FROM blocks WHERE parent_id = '${blockId}' AND type = 'i' ORDER BY sort ASC`
            });
            let children = childrenRes.data || [];
            if (shouldReverse) children = children.reverse();
            
            for (const child of children) {
                await this.processRecursive(child.id, "NodeListItem", actionType, ctx);
            }
        }
    }
}