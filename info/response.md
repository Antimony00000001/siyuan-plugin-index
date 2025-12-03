## 项目概述 (Project Overview):

该项目是一个 Siyuan 笔记插件，旨在增强用户管理和组织笔记内容的能力。其核心功能是根据用户在 Siyuan 笔记中创建的列表结构，自动生成对应的文档层级和内部链接。这极大地简化了从结构化列表到结构化文档的转换过程，提高了笔记的组织效率和可导航性。

## 关键功能 (Key Features):

1.  **列表到文档层级转换**: 能够将 Siyuan 笔记中的多级列表（无序列表、有序列表、任务列表）转换为具有层级关系的文档结构。
2.  **自动生成内部链接**: 在转换过程中，为每个列表项创建对应的 Siyuan 内部文档，并在原始列表项中嵌入指向这些新文档的链接。
3.  **保留列表类型和结构**: 转换后的列表在视觉上保留了原始的列表类型（无序、有序、任务）和层级缩进。
4.  **避免重复创建**: 智能检测同名子页面，避免重复创建文档，提高效率。
5.  **可配置的链接样式**: 允许用户选择生成的链接是标准 Markdown 链接还是 Siyuan 内部引用样式。
6.  **可配置的引用样式**: 允许用户选择生成的块引用样式（虚线引用或实线带图标引用）。
7.  **可配置的图标显示**: 用户可以选择是否在生成的链接前显示图标。
8.  **可配置的索引深度**: 允许用户限制生成的文档层级的最大深度。

## 工作方向概括 (Summary of Work Direction):

我们的工作主要围绕以下几个核心目标展开：

1.  **准确解析 Siyuan DOM 结构**: 克服了 Siyuan 笔记 DOM 结构中 `data-listdata` 属性不可靠的问题，转而通过 `data-subtype` 属性和 `NodeTaskListItemMarker` 等 DOM 元素特征，精确识别列表类型（无序、有序、任务）和任务状态（完成/未完成）。
2.  **构建可靠的内部数据结构**: 使用 `IndexStack` 和 `IndexStackNode` 等数据结构，在内存中准确映射原始列表的层级关系，并存储新创建文档的 `blockId` 和其他相关信息。
3.  **生成符合预期的 Markdown**: 确保生成的 Markdown 字符串能够忠实地反映原始列表的结构、类型、缩进，并正确嵌入指向新文档的 Siyuan 内部链接。
4.  **优化 API 交互**: 解决了 `client.updateBlock` 在更新 `NodeList` 块时可能出现的顺序问题，并通过引入延迟来避免 Siyuan API 调用的潜在并发问题。
5.  **提供用户可配置选项**: 增加了插件设置，允许用户根据个人偏好调整链接类型、引用样式、图标显示和索引深度等行为。

## 相关重要文件 (Important Related Files):

*   **`src/event/blockiconevent.ts`**: 这是核心逻辑文件，包含了处理块图标菜单回调、解析 DOM、构建 `IndexStack`、创建文档以及最终重构带链接 Markdown 的所有关键函数（`buildDoc`, `parseBlockDOM`, `parseChildNodes`, `stackPopAll`, `reconstructListMarkdownWithLinks`）。
*   **`src/indexnode.ts`**: 定义了 `IndexStack` 和 `IndexStackNode` 类，这些是插件内部用于表示和管理列表层级结构的关键数据结构。
*   **`src/settings.ts`**: 定义了插件的所有配置项 (`SettingsProperty` 类) 及其管理逻辑。
*   **`src/components/tab/normal-tab.svelte`**: 插件设置界面的主要组件之一，用于渲染常规设置项，包括我们新添加的引用样式选择。
*   **`src/i18n/en_US.json` & `src/i18n/zh_CN.json`**: 插件的国际化文件，包含了所有用户界面文本，包括新添加的引用样式设置的描述。
