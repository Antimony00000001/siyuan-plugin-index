# Siyuan Native Emoji Panel Investigation

The native emoji selection panel in Siyuan is implemented in `app/src/emoji/index.ts`. This module handles the UI creation, data loading, searching, and selection logic.

## 1. Entry Point: `openEmojiPanel`

The function `openEmojiPanel` is the main entry point. It accepts the following parameters:
*   `id`: The ID of the document or notebook being modified.
*   `type`: The type of object being modified (`"doc" | "notebook" | "av"`).
*   `position`: Coordinates for positioning the dialog.
*   `callback`: An optional callback function invoked when an emoji is selected.

It creates a `Dialog` instance (from `../dialog`) with a specific HTML structure.

## 2. Data Structure

The emoji data is globally available at `window.siyuan.emojis`. It is fetched from the backend API `/api/system/getEmojiConf`.

The data follows these interfaces:

```typescript
interface IEmoji {
    id: string;
    title: string;
    title_zh_cn: string;
    title_ja_jp: string;
    items: IEmojiItem[];
}

interface IEmojiItem {
    unicode: string;
    description: string;
    description_zh_cn: string;
    description_ja_jp: string;
    keywords: string;
}
```

## 3. UI Structure

The dialog content is divided into two tabs:
1.  **Emoji Tab (`data-type="tab-emoji"`)**:
    *   **Search Bar**: An input field for filtering emojis.
    *   **Random Button**: A button to select a random emoji.
    *   **Panel (`emojis__panel`)**: The main container where emojis are rendered.
    *   **Category Bar**: A list of category icons (e.g., Recent, People, Nature) used to quickly jump to sections.

2.  **Dynamic Icon Tab (`data-type="tab-dynamic"`)**:
    *   Controls for generating dynamic icons (calendar, text) with customizable colors, dates, and languages.

## 4. Key Functions

*   **`filterEmoji(key?: string, max?: number)`**:
    *   Generates the HTML string for the emoji list.
    *   If `key` is provided, it filters `window.siyuan.emojis` based on `unicode`, `keywords`, and localized descriptions.
    *   If no key is provided, it renders all categories.
    *   It also renders a "Recent Emojis" section at the top based on `window.siyuan.config.editor.emoji`.

*   **`unicode2Emoji(unicode: string, ...)`**:
    *   Converts a unicode string into an HTML string (usually an `<img>` tag).
    *   Handles standard emojis (served from `/emojis/`) and dynamic icons (`api/icon/getDynamicIcon`).
    *   Supports lazy loading attributes.
    *   **Custom Emoji Strategy**:
        *   If the `unicode` string contains a dot (`.`), it is treated as a filename for a custom image emoji. The function generates an `<img>` tag with `src="/emojis/${unicode}"`. This implies that custom emoji image files (e.g., `my_custom.png`, `another_emoji.svg`) are expected to be located in a server-side directory mapped to the `/emojis/` URL path.
        *   If `unicode` starts with `"api/icon/getDynamicIcon"`, it is a dynamic icon, and the `unicode` string is used directly as the `src`.
        *   Otherwise, `unicode` is treated as standard Unicode characters, parsed, and rendered as text.

*   **`lazyLoadEmoji(element: HTMLElement)`**:
    *   Uses `IntersectionObserver` to lazy-load emoji content as the user scrolls, improving performance.

## 5. Interaction Logic

*   **Event Delegation**: A single `click` event listener on the dialog element handles various actions:
    *   **Category Switching**: Clicking a category icon scrolls the panel to the corresponding section.
    *   **Selection**: Clicking an emoji (`.emojis__item`) triggers the selection logic.
    *   **Removal**: Clicking the trash icon removes the current emoji.
    *   **Random**: Clicking the refresh icon selects a random emoji.

*   **Search**:
    *   The search input listens for `input` and `compositionend` events.
    *   It calls `filterEmoji` with the input value and updates the panel content.

*   **Keyboard Navigation**:
    *   Arrow keys can be used to navigate the emoji grid.
    *   Enter key selects the focused emoji.

## 6. Selection Handling

When an emoji is selected:
1.  An API call is made to update the backend (`/api/notebook/setNotebookIcon` or `/api/attr/setBlockAttrs`).
2.  The `addEmoji` function is called to add the selected emoji to the "Recent" list.
3.  UI update functions (`updateFileTreeEmoji`, `updateOutlineEmoji`) are called to reflect the change immediately in the interface.
4.  The dialog is destroyed.
5.  The optional `callback` is executed.

## Recreating in a Plugin

To recreate this functionality in a plugin:
1.  Access `window.siyuan.emojis` for data.
2.  Implement a similar `filterEmoji` function to search through the data.
3.  Use `unicode2Emoji` (exported from `app/src/emoji/index.ts`) or equivalent logic to render images.
4.  Construct a UI with a search bar and a grid of results.
5.  On selection, use the Siyuan API (e.g., `fetchPost`) to apply the changes.

## Addressing Custom Emoji Display Issues ("无法正常显示会看到链接")

The `unicode2Emoji` function expects custom emoji image files to have their `unicode` property (from `window.siyuan.emojis`) set to their **filename** (e.g., `my_custom_emoji.png`, `brand_icon.svg`). It then constructs the image source as `/emojis/${filename}`.

If custom emojis are appearing as broken links, it indicates an issue with the image file's accessibility:

1.  **Verify Filename in Data**: Ensure that the `unicode` value for your custom emojis within Siyuan's emoji data (`window.siyuan.emojis`, fetched from `/api/system/getEmojiConf`) precisely matches the actual filename of your custom emoji image (including the file extension, e.g., `.png`, `.svg`).
2.  **Check File Location**: The custom emoji image files must be physically present in the server-side directory that Siyuan is configured to serve under the `/emojis/` URL path. If the files are missing or in an incorrect location, the browser will not be able to load them, resulting in a broken image link. You may need to consult Siyuan's documentation or server configuration to determine the exact path for custom emoji assets.

# UI Implementation Details

To achieve an identical visual appearance, you can use the following HTML structure and CSS styles.

## HTML Structure

The following HTML is based on the `openEmojiPanel` function. Note that it uses Siyuan's built-in icons (`<svg><use xlink:href="#iconName"></use></svg>`) and utility classes (prefixed with `fn__` or `b3-`).

```html
<div class="emojis">
    <!-- Tab Header -->
    <div class="emojis__tabheader">
        <div data-type="tab-emoji" class="ariaLabel block__icon block__icon--show block__icon--active" aria-label="Emoji">
            <svg><use xlink:href="#iconEmoji"></use></svg>
        </div>
        <div class="fn__space"></div>
        <div data-type="tab-dynamic" class="ariaLabel block__icon block__icon--show" aria-label="Dynamic Icon">
            <svg><use xlink:href="#iconCalendar"></use></svg>
        </div>
        <div class="fn__flex-1"></div>
        <span class="block__icon block__icon--show fn__flex-center ariaLabel" data-action="remove" aria-label="Remove">
            <svg><use xlink:href="#iconTrashcan"></use></svg>
        </span>
    </div>

    <!-- Tab Body -->
    <div class="emojis__tabbody">
        <!-- Emoji Tab Content -->
        <div class="" data-type="tab-emoji">
            <div class="fn__hr"></div>
            <!-- Search Bar -->
            <div class="fn__flex">
                <span class="fn__space"></span>
                <label class="b3-form__icon fn__flex-1" style="overflow:initial;">
                    <svg class="b3-form__icon-icon"><use xlink:href="#iconSearch"></use></svg>
                    <input class="b3-form__icon-input b3-text-field fn__block" placeholder="Search">
                </label>
                <span class="fn__space"></span>
                <span class="block__icon block__icon--show fn__flex-center ariaLabel" data-action="random" aria-label="Random">
                    <svg><use xlink:href="#iconRefresh"></use></svg>
                </span>
                <span class="fn__space"></span>
            </div>
            <!-- Emoji Grid Panel -->
            <div class="emojis__panel">
                <!-- Content generated by filterEmoji() goes here -->
                <!-- Example structure for a category: -->
                <!--
                <div class="emojis__title" data-type="1">Category Title</div>
                <div class="emojis__content">
                    <button data-unicode="..." class="emojis__item ariaLabel" aria-label="...">
                        <img ...> or unicode character
                    </button>
                </div>
                -->
            </div>
            <!-- Category Bottom Bar -->
            <div class="fn__flex">
                <!-- Example category button -->
                <div data-type="0" class="emojis__type ariaLabel" aria-label="Recent">
                    <!-- Icon/Emoji for category -->
                </div>
                <!-- Repeat for other categories -->
            </div>
        </div>

        <!-- Dynamic Icon Tab Content (Hidden by default) -->
        <div class="fn__none" data-type="tab-dynamic">
            <!-- ... Dynamic icon controls ... -->
        </div>
    </div>
</div>
```

## SCSS / CSS

The following styles are extracted from `app/src/assets/scss/business/_emojis.scss`. These rely on Siyuan's global CSS variables (e.g., `--b3-theme-background`, `--b3-border-color`).

```scss
.emojis {
  word-break: break-all;
  white-space: normal;
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  height: 100%;
  box-sizing: border-box;

  &__tabheader {
    display: flex;
    border-bottom: 1px solid var(--b3-border-color);
    padding: 0 8px 8px;
  }

  &__tabbody {
    flex: 1;
    overflow: auto;

    div[data-type="tab-emoji"] {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
  }

  .emoji__dynamic {
    &-item {
      width: 73px;
      margin: 8px;
      cursor: pointer;
      transition: var(--b3-transition);

      &:hover,
      &--current {
        background-color: var(--b3-theme-background);
        border-radius: var(--b3-border-radius);
        box-shadow: 0 0 0 1px var(--b3-list-hover) inset, 0 0 0 4px var(--b3-theme-background);
      }
    }

    &-color {
      padding: 8px 8px 4px 4px;
    }
  }

  &__item {
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

    img, svg {
      height: 24px;
      display: block;
      width: 24px;
    }

    &--current,
    &:hover {
      background: var(--b3-list-hover);
    }
  }

  &__title {
    color: var(--b3-theme-on-surface);
    padding: 8px 4px 4px 4px;
  }

  &__panel {
    flex: 1;
    overflow: auto;
    padding: 0 8px;
  }

  &__content {
    display: flex;
    flex-wrap: wrap;
  }

  &__type {
    cursor: pointer;
    flex: 1;
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

    &:hover {
      background-color: var(--b3-theme-surface-lighter);
    }

    svg {
      height: 16px;
      width: 16px;
    }
  }
}